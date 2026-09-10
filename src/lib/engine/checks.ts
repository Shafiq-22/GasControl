import type { Ledger, Movement, Purchase, Settings } from '@/lib/types';
import type { CostLayer } from './layers';
import { normaliseLayerKey } from './layers';
import type { ValuationIssue } from './valuation';
import type { BackchargeMatrix, Charge } from './charges';
import type { StockRow } from './stock';
import { storeBalanceTimeline } from './stock';
import { daysBetween, monthKey } from './dates';
import { sum } from './money';

export interface RowIssue {
  register: 'purchase' | 'movement';
  transactionId: string;
  category: 'data' | 'date' | 'reference' | 'duplicate';
  message: string;
}

export interface Control {
  id: string;
  label: string;
  pass: boolean;
  /** Count or difference behind the verdict. */
  measure: number;
  detail: string;
  action: string;
}

/**
 * Row-by-row validation of both registers, matching the workbook's CHECK
 * columns: mandatory and master data, chronology, period rules, duplicates
 * and reference integrity.
 */
export function validateRegisters(ledger: Ledger, layers: CostLayer[]): RowIssue[] {
  const issues: RowIssue[] = [];
  const { settings } = ledger;

  const departments = new Map(ledger.departments.map((d) => [d.code, d]));
  const items = new Map(ledger.items.map((i) => [i.item_code, i]));
  const suppliers = new Map(ledger.suppliers.map((s) => [s.vendor_no, s]));
  const costCodes = new Map(ledger.costCodes.map((c) => [c.code, c]));
  const people = new Map(ledger.personnel.map((p) => [p.name, p]));
  const layerKeys = new Set(layers.map((l) => l.key));
  const movementIds = new Set(ledger.movements.map((m) => m.transaction_id));

  const endpoint = new Set([settings.store_code, settings.supplier_code, settings.loss_code]);
  const isEndpointOrDept = (code: string) => endpoint.has(code) || departments.has(code);

  // ------------------------------------------------------------ purchases
  const poLines = new Map<string, string>();
  for (const p of ledger.purchases) {
    const add = (category: RowIssue['category'], message: string) =>
      issues.push({ register: 'purchase', transactionId: p.transaction_id, category, message });

    if (!items.has(p.item_code)) add('data', `Item ${p.item_code} is not in the gas master.`);
    else if (!items.get(p.item_code)!.active) add('data', `Item ${p.item_code} is inactive.`);

    if (!departments.has(p.purchasing_department)) {
      add('data', `Purchasing department ${p.purchasing_department} is not in the master.`);
    }
    if (p.vendor_no && !suppliers.has(p.vendor_no)) {
      add('data', `Vendor ${p.vendor_no} is not in the supplier master.`);
    }
    if (p.qty_received > p.qty_ordered) {
      add('data', `Received ${p.qty_received} against an order of ${p.qty_ordered}.`);
    }

    if (p.receipt_date && p.receipt_date < p.po_date) {
      add('date', `Receipt ${p.receipt_date} is before the PO date ${p.po_date}.`);
    }
    if (settings.lock_date && p.receipt_date && p.receipt_date <= settings.lock_date) {
      add('date', `Receipt ${p.receipt_date} falls in the locked period (on or before ${settings.lock_date}).`);
    }
    if (p.receipt_date && p.entry_date) {
      const lag = daysBetween(p.receipt_date, p.entry_date.slice(0, 10));
      if (lag > settings.max_backdating_days) {
        add('date', `Entered ${lag} days after receipt; the limit is ${settings.max_backdating_days}.`);
      }
    }

    const key = `${p.po_no}/${p.po_line}`;
    const seen = poLines.get(key);
    if (seen) add('duplicate', `PO line ${key} is already recorded on ${seen}.`);
    else poLines.set(key, p.transaction_id);
  }

  // ------------------------------------------------------------ movements
  const linkedDraw = new Map<string, number>();

  for (const m of ledger.movements) {
    const add = (category: RowIssue['category'], message: string) =>
      issues.push({ register: 'movement', transactionId: m.transaction_id, category, message });

    if (!items.has(m.item_code)) add('data', `Item ${m.item_code} is not in the gas master.`);
    else if (!items.get(m.item_code)!.active) add('data', `Item ${m.item_code} is inactive.`);

    if (!isEndpointOrDept(m.from_code)) add('data', `From ${m.from_code} is neither a department nor an endpoint.`);
    if (!isEndpointOrDept(m.to_code)) add('data', `To ${m.to_code} is neither a department nor an endpoint.`);
    if (m.from_code === m.to_code) add('data', 'From and To are the same.');

    const needsReceiver = m.kind === 'ISSUE' || m.kind === 'TRANSFER';
    if (settings.require_receiver && needsReceiver) {
      if (!m.receiver_name) add('data', 'A receiver is required for issues and transfers.');
      else if (!people.has(m.receiver_name)) add('data', `Receiver ${m.receiver_name} is not in the personnel master.`);
      else if (!people.get(m.receiver_name)!.active) add('data', `Receiver ${m.receiver_name} is inactive.`);
    }

    const needsCostCode = m.kind === 'ISSUE' || m.kind === 'TRANSFER';
    if (settings.require_cost_code && needsCostCode) {
      if (!m.cost_code) add('data', 'A cost code is required for issues and transfers.');
      else if (!costCodes.has(m.cost_code)) add('data', `Cost code ${m.cost_code} is not in the master.`);
      else {
        const cc = costCodes.get(m.cost_code)!;
        if (!cc.active) add('data', `Cost code ${m.cost_code} is inactive.`);
        const consumer = m.kind === 'ISSUE' ? m.to_code : m.to_code;
        if (cc.owning_department !== consumer) {
          add('data', `Cost code ${m.cost_code} belongs to ${cc.owning_department}, not ${consumer}.`);
        }
      }
    }

    if (m.kind === 'RETURN_UNUSED' && !m.source_po_line) {
      add('reference', 'An unused return must name the source PO line it came from.');
    }
    if (m.source_po_line && !layerKeys.has(normaliseLayerKey(m.source_po_line))) {
      add('reference', `Source PO ${m.source_po_line} does not match a received PO line.`);
    }
    if (m.original_transaction_id && !movementIds.has(m.original_transaction_id)) {
      add('reference', `Original transaction ${m.original_transaction_id} does not exist.`);
    }
    if (m.kind === 'TRANSFER' && !m.original_transaction_id) {
      add('reference', 'A transfer must reference the issue it came from.');
    }

    if (settings.lock_date && m.moved_on <= settings.lock_date) {
      add('date', `Dated ${m.moved_on}, inside the locked period (on or before ${settings.lock_date}).`);
    }
    const lag = daysBetween(m.moved_on, m.entry_timestamp.slice(0, 10));
    if (lag > settings.max_backdating_days) {
      add('date', `Entered ${lag} days after the movement; the limit is ${settings.max_backdating_days}.`);
    }
    if (lag < 0) add('date', 'The entry timestamp is before the movement date.');

    // A source PO may not be drawn for more than it received.
    if (m.source_po_line && settings.honour_po_link) {
      const key = normaliseLayerKey(m.source_po_line);
      const delta = m.kind === 'RETURN_UNUSED' ? -m.quantity : m.kind === 'ISSUE' ? m.quantity : 0;
      linkedDraw.set(key, (linkedDraw.get(key) ?? 0) + delta);
    }
  }

  const layerByKey = new Map(layers.map((l) => [l.key, l]));
  for (const [key, drawn] of linkedDraw) {
    const layer = layerByKey.get(key);
    if (!layer) continue;
    if (drawn > layer.quantity + 1e-9) {
      issues.push({
        register: 'movement',
        transactionId: key,
        category: 'duplicate',
        message: `Source PO ${key} received ${layer.quantity} but ${drawn} have been drawn against it.`,
      });
    }
  }

  return issues;
}

export interface ControlInput {
  ledger: Ledger;
  layers: CostLayer[];
  stock: StockRow[];
  charges: Charge[];
  monthCharges: Charge[];
  matrix: BackchargeMatrix;
  rowIssues: RowIssue[];
  valuationIssues: ValuationIssue[];
}

/**
 * The release gate. Every control must pass before a month's backcharge is
 * posted; any FAIL blocks release, exactly as the workbook's dashboard does.
 */
export function buildControls(input: ControlInput): Control[] {
  const { ledger, layers, stock, charges, monthCharges, matrix, rowIssues, valuationIssues } = input;
  const { settings } = ledger;
  const tol = settings.tolerance;

  const controls: Control[] = [];
  const add = (
    id: string,
    label: string,
    measure: number,
    detail: string,
    action: string,
    pass = Math.abs(measure) <= tol,
  ) => controls.push({ id, label, pass, measure, detail, action });

  // 1 — every cylinder received is accounted for somewhere.
  const cylinderDrift = sum(stock.map((s) => Math.abs(s.cylinderBalance)));
  add('cylinders', 'Cylinder count', cylinderDrift,
    'Store, department, empty, supplier and written-off quantities must add back to everything received.',
    'Reconcile the movement register against a physical count.');

  // 2 — the valuation has not drifted from the physical register.
  const layerDrift = sum(stock.map((s) => Math.abs(s.layerBalance)));
  add('layers', 'Layer reconciliation', layerDrift,
    settings.trigger_rule === 'ON_RETURN'
      ? 'Not applicable while charging on return: gas is charged after it leaves the store.'
      : 'Cylinders left in the store must match the quantity left in the cost layers.',
    'Check receipts, issues and unused returns for a quantity entered against the wrong item.');

  // 3 — received value = value still held + value consumed.
  const receivedValue = sum(layers.map((l) => l.receivedValue));
  const heldValue = sum(stock.map((s) => s.stockValue));
  const consumedValue = sum(charges.map((c) => c.amount));
  const upliftValue = sum(
    charges.filter((c) => c.owner !== c.consumer).map((c) => c.amount * (settings.backcharge_uplift / (1 + settings.backcharge_uplift))),
  );
  const valueDrift = receivedValue - heldValue - (consumedValue - upliftValue);
  add('value', 'Value reconciliation', valueDrift,
    'Purchase value must equal stock still held plus gas charged out, before any recharge uplift.',
    'Check purchase layers, consumption and write-offs.');

  // 4 — the store never went negative on any dated balance.
  let negativeDays = 0;
  for (const item of ledger.items) {
    const timeline = storeBalanceTimeline(item.item_code, ledger.purchases, ledger.movements);
    negativeDays += timeline.filter((point) => point.balance < -tol).length;
  }
  add('negative', 'Daily store balance', settings.allow_negative_stock ? 0 : negativeDays,
    settings.allow_negative_stock
      ? 'Negative physical stock is permitted by the current settings.'
      : `${negativeDays} dated store balance(s) fall below zero.`,
    'Correct the receipt date or the issued quantity that overdraws the store.');

  // 5-8 — register row checks, split the way the workbook splits them.
  const byCategory = (category: RowIssue['category']) =>
    rowIssues.filter((issue) => issue.category === category).length;

  add('data', 'Mandatory / master data', byCategory('data'),
    'Rows referencing a missing or inactive master code, or missing something mandatory.',
    'Fix the flagged rows or add the missing master record.');
  add('chronology', 'References / chronology', byCategory('reference'),
    'Source PO lines and original transaction ids must resolve.',
    'Check the referenced PO line and original issue.');
  add('period', 'Period / backdating', byCategory('date'),
    'Locked-period entries and excessive backdating.',
    'Resolve before posting, or move the lock date.');
  add('duplicates', 'Duplicate IDs / PO lines', byCategory('duplicate'),
    'Duplicate PO lines, or a source PO drawn for more than it received.',
    'Remove the duplicate or correct the over-allocated source PO.');

  // 9 — FIFO could satisfy every draw.
  const fifoErrors = valuationIssues.filter((issue) => issue.severity === 'error').length;
  add('fifo', 'FIFO allocation', fifoErrors,
    'Insufficient stock, an exhausted reserved layer, or demand with no layer to draw from.',
    'Record the missing receipt, or correct the issued quantity.');

  // 10 — interdepartment settlement is a closed system.
  const netSum = sum([...matrix.netReceivable.values()]);
  add('settlement', 'Settlement zero sum', netSum,
    'What one department is owed another must owe. The net across all departments is zero.',
    'Check for a charge whose owner or consumer is not an active department.');

  // 11 — the diagonal is own consumption and nothing else.
  const diagonal = sum(matrix.departments.map((d) => matrix.cell.get(d)!.get(d) ?? 0));
  const ownTotal = sum([...matrix.ownConsumption.values()]);
  add('diagonal', 'Own-consumption diagonal', diagonal - ownTotal,
    'Each diagonal cell must equal that department consuming gas it bought itself.',
    'Check charges whose owner and consumer are the same department.');

  // 12 — the matrix accounts for every charge line in the month.
  const matrixTotal = matrix.grandTotal;
  const lineTotal = sum(monthCharges.map((c) => c.amount));
  add('coverage', 'Statement coverage', matrixTotal - lineTotal,
    'The matrix total must equal the detail lines behind it.',
    'Check for a charge against a department that is not in the master.');

  // 13 — there is something to report.
  add('populated', 'Reporting month populated', monthCharges.length > 0 ? 0 : 1,
    monthCharges.length > 0
      ? `${monthCharges.length} charge line(s) in ${monthKey(settings.report_month)}.`
      : 'No charges fall in the reporting month.',
    'Check the reporting month, or record the month\'s movements.',
    monthCharges.length > 0);

  // 14 — configuration is finished.
  const placeholders = [settings.company_name, settings.custodian, settings.posting_account].filter(
    (value) => /CONFIGURE/i.test(value),
  ).length;
  const noDepartments = ledger.departments.filter((d) => d.active).length < 2;
  const configIssues = placeholders + (noDepartments ? 1 : 0);
  add('config', 'Configuration complete', configIssues,
    placeholders > 0
      ? 'Company name, custodian and posting account must be set before posting.'
      : noDepartments
        ? 'At least two active departments are needed to backcharge between them.'
        : 'Organisation, custodian and posting account are set.',
    'Finish the Settings page.');

  return controls;
}

export function releaseStatus(controls: Control[]): { released: boolean; failing: Control[] } {
  const failing = controls.filter((c) => !c.pass);
  return { released: failing.length === 0, failing };
}

export type { Purchase, Movement, Settings };
