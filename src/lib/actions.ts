'use server';

import { getLedger } from '@/lib/data';
import { buildReport } from '@/lib/engine';
import { postingFigures } from '@/lib/posting';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { MOVEMENT_KINDS } from '@/lib/types';

export interface ActionResult {
  ok: boolean;
  message: string;
  /** Field name -> problem, for inline display. */
  fieldErrors?: Record<string, string>;
}

function fail(message: string, fieldErrors?: Record<string, string>): ActionResult {
  return { ok: false, message, fieldErrors };
}

function flatten(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Empty form fields arrive as '' but the database wants null. */
const optionalText = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().nullable(),
);
const optionalNumber = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
  z.number().nullable(),
);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');

// ------------------------------------------------------------- purchases

const purchaseSchema = z
  .object({
    po_date: isoDate,
    po_no: z.string().trim().min(1, 'PO number is required'),
    po_line: z.coerce.number().int().positive('PO line must be 1 or more'),
    vendor_no: optionalText,
    purchasing_department: z.string().trim().min(1, 'Choose the purchasing department'),
    item_code: z.string().trim().min(1, 'Choose an item'),
    qty_ordered: z.coerce.number().positive('Quantity ordered must be more than zero'),
    unit_refill_rate: z.coerce.number().nonnegative('Rate cannot be negative'),
    delivery_charge: z.coerce.number().nonnegative().default(0),
    other_charges: z.coerce.number().nonnegative().default(0),
    qty_received: z.coerce.number().nonnegative().default(0),
    receipt_date: z.preprocess((v) => (v === '' ? null : v), isoDate.nullable()),
    received_by: optionalText,
    remarks: optionalText,
  })
  .refine((v) => v.qty_received === 0 || v.receipt_date !== null, {
    message: 'A received quantity needs a receipt date',
    path: ['receipt_date'],
  })
  .refine((v) => v.qty_received <= v.qty_ordered, {
    message: 'Received cannot exceed ordered',
    path: ['qty_received'],
  })
  .refine((v) => !v.receipt_date || v.receipt_date >= v.po_date, {
    message: 'Receipt cannot predate the PO',
    path: ['receipt_date'],
  });

export async function recordPurchase(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = purchaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail('Check the highlighted fields.', flatten(parsed.error));

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail('Your session has expired. Sign in again.');

  const { error } = await supabase.from('purchases').insert({
    ...parsed.data,
    entered_by: auth.user.email,
    created_by: auth.user.id,
  });

  if (error) {
    if (error.code === '23505') {
      return fail(`PO line ${parsed.data.po_no}/${parsed.data.po_line} is already recorded.`);
    }
    if (error.code === '42501') {
      return fail('Your role is read-only. Ask an administrator for recording rights.');
    }
    return fail(error.message);
  }

  revalidatePath('/', 'layout');
  return { ok: true, message: `Recorded ${parsed.data.po_no}/${parsed.data.po_line}.` };
}

// ------------------------------------------------------------- movements

const movementSchema = z
  .object({
    moved_on: isoDate,
    kind: z.enum(MOVEMENT_KINDS as [string, ...string[]]),
    item_code: z.string().trim().min(1, 'Choose an item'),
    quantity: z.coerce.number().positive('Quantity must be more than zero'),
    from_code: z.string().trim().min(1, 'Choose where it came from'),
    to_code: z.string().trim().min(1, 'Choose where it went'),
    receiver_name: optionalText,
    cost_code: optionalText,
    location_area: optionalText,
    source_po_line: optionalText,
    residual_pct: optionalNumber,
    reason: optionalText,
    original_transaction_id: optionalText,
    remarks: optionalText,
  })
  .refine((v) => v.from_code !== v.to_code, {
    message: 'From and To cannot be the same',
    path: ['to_code'],
  })
  .refine((v) => v.kind !== 'RETURN_UNUSED' || !!v.source_po_line, {
    message: 'An unused return must name the source PO line',
    path: ['source_po_line'],
  })
  .refine((v) => v.kind !== 'TRANSFER' || !!v.original_transaction_id, {
    message: 'A transfer must reference the original issue',
    path: ['original_transaction_id'],
  });

export async function recordMovement(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = movementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail('Check the highlighted fields.', flatten(parsed.error));

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail('Your session has expired. Sign in again.');

  // Enforce the store's own policies here as well as in the report, so a bad
  // row never reaches the register in the first place.
  const { data: settings } = await supabase
    .from('settings')
    .select('require_cost_code, require_receiver, allow_negative_stock, loss_code')
    .single();

  const needsContext = parsed.data.kind === 'ISSUE' || parsed.data.kind === 'TRANSFER';
  if (settings?.require_cost_code && needsContext && !parsed.data.cost_code) {
    return fail('Check the highlighted fields.', { cost_code: 'A cost code is required' });
  }
  if (settings?.require_receiver && needsContext && !parsed.data.receiver_name) {
    return fail('Check the highlighted fields.', { receiver_name: 'A receiver is required' });
  }

  const { error } = await supabase.from('movements').insert({
    ...parsed.data,
    entered_by: auth.user.email,
    created_by: auth.user.id,
  });

  if (error) {
    if (error.code === '42501') {
      return fail('Your role is read-only. Ask an administrator for recording rights.');
    }
    if (error.code === '23503') {
      return fail('A referenced code does not exist. Check the item, cost code or original transaction.');
    }
    return fail(error.message);
  }

  revalidatePath('/', 'layout');
  return { ok: true, message: `Recorded a ${parsed.data.kind.toLowerCase().replace('_', ' ')} of ${parsed.data.quantity}.` };
}

// -------------------------------------------------------------- settings

const settingsSchema = z.object({
  company_name: z.string().trim().min(1),
  store_name: z.string().trim().min(1),
  custodian: z.string().trim().min(1),
  currency_code: z.string().trim().min(1).max(8),
  posting_decimals: z.coerce.number().int().min(0).max(4),
  rounding: z.enum(['NEAREST', 'UP', 'DOWN']),
  fy_start_month: z.coerce.number().int().min(1).max(12),
  report_month: isoDate,
  history_start: isoDate,
  lock_date: z.preprocess((v) => (v === '' ? null : v), isoDate.nullable()),
  purchase_vat_rate: z.coerce.number().min(0).max(1),
  purchase_includes_vat: z.coerce.boolean(),
  backcharge_vat_rate: z.coerce.number().min(0).max(1),
  backcharge_uplift: z.coerce.number().min(0).max(1),
  valuation: z.enum(['FIFO_MONTHLY', 'WAC', 'STD']),
  honour_po_link: z.coerce.boolean(),
  trigger_rule: z.enum(['ON_ISSUE', 'ON_ISSUE_MONTH_END', 'ON_RETURN']),
  delivery_allocation: z.enum(['PER_CYLINDER', 'PER_VALUE', 'PER_LINE']),
  purchasing_department: optionalText,
  require_cost_code: z.coerce.boolean(),
  require_receiver: z.coerce.boolean(),
  allow_negative_stock: z.coerce.boolean(),
  max_backdating_days: z.coerce.number().int().min(0).max(365),
  empty_state_policy: z.enum(['ASSUME_ALL_OUT', 'IGNORE']),
  posting_account: z.string().trim().min(1),
  tolerance: z.coerce.number().min(0),
  stock_unit: z.string().trim().min(1),
});

export async function saveSettings(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const raw = Object.fromEntries(formData);
  // Unchecked checkboxes are simply absent from the payload.
  for (const flag of [
    'purchase_includes_vat', 'honour_po_link', 'require_cost_code',
    'require_receiver', 'allow_negative_stock',
  ]) {
    raw[flag] = formData.get(flag) === 'on' ? 'true' : '';
  }
  // The month pickers give yyyy-mm; the columns are real dates.
  for (const field of ['report_month', 'history_start']) {
    const value = raw[field];
    if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) raw[field] = `${value}-01`;
  }

  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return fail('Check the highlighted fields.', flatten(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase
    .from('settings')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', true);

  if (error) {
    if (error.code === '42501') return fail('Only an administrator can change settings.');
    return fail(error.message);
  }

  revalidatePath('/', 'layout');
  return { ok: true, message: 'Settings saved.' };
}

// --------------------------------------------------------------- masters

const MASTER_TABLES = {
  departments: { key: 'code', label: 'Department' },
  gas_items: { key: 'item_code', label: 'Gas item' },
  suppliers: { key: 'vendor_no', label: 'Supplier' },
  cost_codes: { key: 'code', label: 'Cost code' },
  personnel: { key: 'employee_no', label: 'Person' },
} as const;

type MasterTable = keyof typeof MASTER_TABLES;

const masterSchemas: Record<MasterTable, z.ZodTypeAny> = {
  departments: z.object({
    code: z.string().trim().min(1).max(12).toUpperCase(),
    full_name: z.string().trim().min(1),
    cost_centre: z.string().trim().min(1),
    contact: optionalText,
    active: z.coerce.boolean(),
    sort_order: z.coerce.number().int().default(0),
  }),
  gas_items: z.object({
    item_code: z.string().trim().min(1).max(32).toUpperCase(),
    description: z.string().trim().min(1),
    gas_type: optionalText,
    cylinder_size: optionalText,
    unit: z.string().trim().min(1).default('cyl'),
    nominal_content: optionalText,
    standard_rate: z.coerce.number().nonnegative().default(0),
    hazard_class: optionalText,
    active: z.coerce.boolean(),
    reorder_point: z.coerce.number().nonnegative().default(0),
    minimum_stock: z.coerce.number().nonnegative().default(0),
    max_dept_holding: z.coerce.number().nonnegative().default(0),
    sort_order: z.coerce.number().int().default(0),
  }),
  suppliers: z.object({
    vendor_no: z.string().trim().min(1).max(32).toUpperCase(),
    name: z.string().trim().min(1),
    contact: optionalText,
    active: z.coerce.boolean(),
  }),
  cost_codes: z.object({
    code: z.string().trim().min(1).max(32).toUpperCase(),
    description: z.string().trim().min(1),
    owning_department: z.string().trim().min(1),
    active: z.coerce.boolean(),
  }),
  personnel: z.object({
    employee_no: z.string().trim().min(1).max(32).toUpperCase(),
    name: z.string().trim().min(1),
    department: z.string().trim().min(1),
    active: z.coerce.boolean(),
  }),
};

export async function saveMasterRow(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const table = String(formData.get('__table') ?? '') as MasterTable;
  if (!(table in MASTER_TABLES)) return fail('Unknown master table.');

  const raw = Object.fromEntries(formData);
  delete raw.__table;
  raw.active = formData.get('active') === 'on' ? 'true' : '';

  const parsed = masterSchemas[table].safeParse(raw);
  if (!parsed.success) return fail('Check the highlighted fields.', flatten(parsed.error as z.ZodError));

  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .upsert(parsed.data, { onConflict: MASTER_TABLES[table].key });

  if (error) {
    if (error.code === '42501') return fail('Only an administrator can edit master data.');
    if (error.code === '23503') return fail('A referenced department does not exist.');
    return fail(error.message);
  }

  revalidatePath('/', 'layout');
  return { ok: true, message: `${MASTER_TABLES[table].label} saved.` };
}

// ---------------------------------------------------------------- roles

export async function setUserRole(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const schema = z.object({
    id: z.string().uuid(),
    role: z.enum(['admin', 'custodian', 'viewer', 'pending']),
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail('Choose a valid role.');

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  // An admin demoting themselves could lock everyone out of settings.
  if (auth.user?.id === parsed.data.id && parsed.data.role !== 'admin') {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');
    if ((count ?? 0) <= 1) return fail('You are the only administrator. Promote someone else first.');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.id);

  if (error) {
    if (error.code === '42501') return fail('Only an administrator can change roles.');
    return fail(error.message);
  }

  revalidatePath('/', 'layout');
  return { ok: true, message: 'Role updated.' };
}

// --------------------------------------------------------------- posting

export async function recordPosting(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const schema = z.object({
    report_month: isoDate,
    reference: z.string().trim().min(1, 'Enter the accounting reference'),
    notes: optionalText,
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail('Check the highlighted fields.', flatten(parsed.error));

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) return fail('Your session expired. Sign in again.');
  let figures;
  try {
    const ledger = await getLedger();
    const report = buildReport({ ...ledger, settings: { ...ledger.settings, report_month: parsed.data.report_month } });
    figures = postingFigures(report);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to verify the posting.');
  }
  const { error } = await supabase
    .from('postings')
    .insert({ ...parsed.data, ...figures, posted_by: auth.user.id });

  if (error) {
    if (error.code === '23505') return fail('That month has already been posted.');
    if (error.code === '42501') return fail('Your role is read-only.');
    return fail(error.message);
  }

  revalidatePath('/', 'layout');
  return { ok: true, message: 'Posting recorded.' };
}
