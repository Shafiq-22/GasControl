import { IMPORT_BUCKET, MAX_IMPORT_BYTES, isOwnedImportPath } from '@/lib/import-upload';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { date, number, parseWorkbook, text, yesNo, type ImportRow } from '@/lib/excel/import';
import { MOVEMENT_KINDS, type MovementKind } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_BYTES = MAX_IMPORT_BYTES;

export interface ImportSummary {
  table: string;
  read: number;
  written: number;
  skipped: { row: number; reason: string }[];
}

/**
 * Bulk import from the source workbook.
 *
 * Master data is upserted, since a code is its own identity. The two
 * registers are inserted and ignore anything already present, because they
 * are append-only: re-importing the same file adds nothing.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', auth.user.id).single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Importing is administrator-only.' }, { status: 403 });
  }

  let dryRun = true;
  let file: Blob;
  let storagePath: string | null = null;
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      const body = await request.json();
      if (!isOwnedImportPath(body.storagePath, auth.user.id)) {
        return NextResponse.json({ error: 'Invalid upload reference.' }, { status: 400 });
      }
      storagePath = body.storagePath;
      dryRun = body.dryRun !== false;
      const { data, error } = await supabase.storage.from(IMPORT_BUCKET).download(storagePath!);
      if (error || !data) return NextResponse.json({ error: 'The private upload could not be read. Upload it again.' }, { status: 400 });
      file = data;
    } else {
      const form = await request.formData();
      dryRun = form.get('dry_run') === 'on';
      const input = form.get('file');
      if (!(input instanceof File)) return NextResponse.json({ error: 'Choose a workbook to import.' }, { status: 400 });
      file = input;
    }
  } catch {
    return NextResponse.json({ error: 'The upload request could not be read.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    if (storagePath) await supabase.storage.from(IMPORT_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: 'That file is larger than 25 MB.' }, { status: 413 });
  }

  let parsed;
  try {
    parsed = await parseWorkbook(await file.arrayBuffer());
  } catch (error) {
    return NextResponse.json(
      { error: `That file could not be read as a workbook: ${(error as Error).message}` },
      { status: 400 },
    );
  } finally {
    if (storagePath) await supabase.storage.from(IMPORT_BUCKET).remove([storagePath]);
  }

  const summaries: ImportSummary[] = [];
  const warnings = [...parsed.warnings];

  /** Builds rows, records why any were skipped, then writes them. */
  type Payload = Record<string, unknown>;

  async function load(
    table: string,
    rows: ImportRow[],
    build: (row: ImportRow) => Payload | string,
    conflict: string | null,
  ) {
    const summary: ImportSummary = { table, read: rows.length, written: 0, skipped: [] };
    const payload: Payload[] = [];

    for (const row of rows) {
      const built = build(row);
      if (typeof built === 'string') {
        summary.skipped.push({ row: row.rowNumber, reason: built });
        continue;
      }
      payload.push(built);
    }

    if (payload.length > 0 && !dryRun) {
      // Chunked so a large historical register does not exceed the request
      // size, and so one bad chunk does not lose the rest.
      for (let index = 0; index < payload.length; index += 500) {
        const chunk = payload.slice(index, index + 500);
        // The typed client cannot narrow a table chosen at runtime.
        const writer = supabase.from(table) as unknown as {
          upsert: (values: Payload[], options: { onConflict: string; ignoreDuplicates?: boolean })
            => Promise<{ error: { message: string } | null }>;
        };
        const query = conflict
          ? writer.upsert(chunk, { onConflict: conflict })
          : writer.upsert(chunk, { onConflict: 'transaction_id', ignoreDuplicates: true });
        const { error } = await query;
        if (error) {
          summary.skipped.push({ row: 0, reason: `${error.message} (rows ${index + 1}–${index + chunk.length})` });
          continue;
        }
        summary.written += chunk.length;
      }
    } else if (dryRun) {
      summary.written = payload.length;
    }

    summaries.push(summary);
  }

  // Masters first: the registers reference them.
  await load('departments', parsed.departments, (row) => {
    const code = text(row, 'Code');
    const name = text(row, 'Full name', 'Name');
    if (!code) return 'No code';
    if (/^(code)$/i.test(code)) return 'Header row';
    return {
      code: code.toUpperCase(),
      full_name: name ?? code,
      cost_centre: text(row, 'Cost centre') ?? code,
      contact: text(row, 'Contact'),
      active: yesNo(row, 'Active'),
    };
  }, 'code');

  await load('gas_items', parsed.items, (row) => {
    const code = text(row, 'Item Code');
    if (!code) return 'No item code';
    return {
      item_code: code.toUpperCase(),
      description: text(row, 'Description') ?? code,
      gas_type: text(row, 'Gas type'),
      cylinder_size: text(row, 'Cylinder size'),
      unit: text(row, 'Unit') ?? 'cyl',
      nominal_content: text(row, 'Nominal content'),
      standard_rate: number(row, 'Standard rate') ?? 0,
      hazard_class: text(row, 'Hazard class'),
      active: yesNo(row, 'Active'),
      reorder_point: number(row, 'Reorder point', 'Reorder at') ?? 0,
      minimum_stock: number(row, 'Minimum stock', 'Minimum') ?? 0,
      max_dept_holding: number(row, 'Max dept holding', 'Max held') ?? 0,
    };
  }, 'item_code');

  await load('suppliers', parsed.suppliers, (row) => {
    const vendor = text(row, 'Vendor no.');
    if (!vendor) return 'No vendor number';
    return {
      vendor_no: vendor.toUpperCase(),
      name: text(row, 'Name') ?? vendor,
      contact: text(row, 'Contact'),
      active: yesNo(row, 'Active'),
    };
  }, 'vendor_no');

  await load('cost_codes', parsed.costCodes, (row) => {
    const code = text(row, 'Code');
    const owner = text(row, 'Owning department');
    if (!code) return 'No code';
    if (!owner) return 'No owning department';
    return {
      code: code.toUpperCase(),
      description: text(row, 'Description') ?? code,
      owning_department: owner.toUpperCase(),
      active: yesNo(row, 'Active'),
    };
  }, 'code');

  await load('personnel', parsed.personnel, (row) => {
    const employee = text(row, 'Employee no.');
    const name = text(row, 'Name');
    const department = text(row, 'Department');
    if (!employee) return 'No employee number';
    if (!name) return 'No name';
    if (!department) return 'No department';
    return {
      employee_no: employee.toUpperCase(),
      name,
      department: department.toUpperCase(),
      active: yesNo(row, 'Active'),
    };
  }, 'employee_no');

  // Registers. Existing transaction ids are left untouched.
  await load('purchases', parsed.purchases, (row) => {
    const poNo = text(row, 'PO no.', 'PO number');
    const poDate = date(row, 'PO date');
    const item = text(row, 'Item Code');
    const department = text(row, 'Purchasing department');
    const ordered = number(row, 'Qty ordered');

    if (!poNo || !poDate) return 'No PO number or date';
    if (!item) return 'No item code';
    if (!department) return 'No purchasing department';
    if (ordered === null || ordered <= 0) return 'Quantity ordered must be more than zero';

    const received = number(row, 'Qty received') ?? 0;
    const receipt = date(row, 'Receipt date');
    if (received > 0 && !receipt) return 'A received quantity needs a receipt date';

    const id = text(row, 'Transaction ID');
    const entry = date(row, 'Entry date', 'Entry timestamp');

    return {
      ...(id ? { transaction_id: id } : {}),
      po_date: poDate,
      po_no: poNo,
      po_line: number(row, 'PO line') ?? 1,
      vendor_no: text(row, 'Vendor no.'),
      purchasing_department: department.toUpperCase(),
      item_code: item.toUpperCase(),
      qty_ordered: ordered,
      unit_refill_rate: number(row, 'Unit refill rate') ?? 0,
      delivery_charge: number(row, 'Delivery charge') ?? 0,
      other_charges: number(row, 'Other charges') ?? 0,
      qty_received: received,
      receipt_date: receipt,
      received_by: text(row, 'Received by'),
      remarks: text(row, 'Remarks'),
      entered_by: text(row, 'Entered by') ?? auth.user!.email,
      ...(entry ? { entry_date: entry } : {}),
      created_by: auth.user!.id,
    };
  }, null);

  await load('movements', parsed.movements, (row) => {
    const movedOn = date(row, 'Date');
    const rawKind = text(row, 'Movement type', 'Type');
    const item = text(row, 'Item Code');
    const quantity = number(row, 'Quantity');
    const from = text(row, 'From');
    const to = text(row, 'To');

    if (!movedOn) return 'No date';
    if (!rawKind) return 'No movement type';
    const kind = rawKind.toUpperCase().replace(/[\s-]+/g, '_') as MovementKind;
    if (!MOVEMENT_KINDS.includes(kind)) return `Unknown movement type "${rawKind}"`;
    if (!item) return 'No item code';
    if (quantity === null || quantity <= 0) return 'Quantity must be more than zero';
    if (!from || !to) return 'No From or To';
    if (from.toUpperCase() === to.toUpperCase()) return 'From and To are the same';

    const id = text(row, 'Transaction ID');
    const entry = date(row, 'Entry timestamp', 'Entry date');

    return {
      ...(id ? { transaction_id: id } : {}),
      moved_on: movedOn,
      kind,
      item_code: item.toUpperCase(),
      quantity,
      from_code: from.toUpperCase(),
      to_code: to.toUpperCase(),
      receiver_name: text(row, 'Receiver name', 'Receiver'),
      cost_code: text(row, 'Cost code'),
      location_area: text(row, 'Location / area', 'Location'),
      source_po_line: text(row, 'Source PO Line', 'Source PO'),
      residual_pct: number(row, 'Residual %'),
      reason: text(row, 'Reason'),
      original_transaction_id: text(row, 'Original transaction ID'),
      remarks: text(row, 'Remarks'),
      ...(entry ? { entry_timestamp: entry } : {}),
      entered_by: text(row, 'Entered by') ?? auth.user!.email,
      created_by: auth.user!.id,
    };
  }, null);

  // Keep the id generators past anything the file brought in, so the next
  // recorded row does not collide with an imported one.
  if (!dryRun) {
    await supabase.rpc('resync_transaction_sequences');
  }

  return NextResponse.json({ dryRun, summaries, warnings });
}
