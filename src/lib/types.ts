/** Domain types. These mirror the Supabase tables one-for-one. */

export type MovementKind =
  | 'ISSUE'
  | 'RETURN_EMPTY'
  | 'RETURN_UNUSED'
  | 'TRANSFER'
  | 'TO_SUPPLIER'
  | 'ADJUSTMENT';

export const MOVEMENT_KINDS: MovementKind[] = [
  'ISSUE',
  'RETURN_EMPTY',
  'RETURN_UNUSED',
  'TRANSFER',
  'TO_SUPPLIER',
  'ADJUSTMENT',
];

export type ValuationMethod = 'FIFO_MONTHLY' | 'WAC' | 'STD';
export type ChargeTrigger = 'ON_ISSUE' | 'ON_ISSUE_MONTH_END' | 'ON_RETURN';
export type RoundingRule = 'NEAREST' | 'UP' | 'DOWN';
export type DeliveryAllocation = 'PER_CYLINDER' | 'PER_LINE';
export type EmptyPolicy = 'ASSUME_ALL_OUT' | 'IGNORE';
export type AppRole = 'admin' | 'custodian' | 'viewer';

export interface Settings {
  company_name: string;
  store_name: string;
  custodian: string;
  currency_code: string;
  posting_decimals: number;
  rounding: RoundingRule;
  fy_start_month: number;
  /** First day of the reporting month, ISO yyyy-mm-dd. */
  report_month: string;
  history_start: string;
  lock_date: string | null;
  purchase_vat_rate: number;
  purchase_includes_vat: boolean;
  backcharge_vat_rate: number;
  backcharge_uplift: number;
  valuation: ValuationMethod;
  honour_po_link: boolean;
  trigger_rule: ChargeTrigger;
  delivery_allocation: DeliveryAllocation;
  purchasing_department: string | null;
  require_cost_code: boolean;
  require_receiver: boolean;
  allow_negative_stock: boolean;
  max_backdating_days: number;
  empty_state_policy: EmptyPolicy;
  posting_account: string;
  tolerance: number;
  stock_unit: string;
  store_code: string;
  supplier_code: string;
  loss_code: string;
}

export interface Department {
  code: string;
  full_name: string;
  cost_centre: string;
  contact: string | null;
  active: boolean;
  sort_order: number;
}

export interface GasItem {
  item_code: string;
  description: string;
  gas_type: string | null;
  cylinder_size: string | null;
  unit: string;
  nominal_content: string | null;
  standard_rate: number;
  hazard_class: string | null;
  active: boolean;
  reorder_point: number;
  minimum_stock: number;
  max_dept_holding: number;
  sort_order: number;
}

export interface Supplier {
  vendor_no: string;
  name: string;
  contact: string | null;
  active: boolean;
}

export interface CostCode {
  code: string;
  description: string;
  owning_department: string;
  active: boolean;
}

export interface Person {
  employee_no: string;
  name: string;
  department: string;
  active: boolean;
}

export interface Purchase {
  id: string;
  transaction_id: string;
  po_date: string;
  po_no: string;
  po_line: number;
  vendor_no: string | null;
  purchasing_department: string;
  item_code: string;
  qty_ordered: number;
  unit_refill_rate: number;
  delivery_charge: number;
  other_charges: number;
  qty_received: number;
  receipt_date: string | null;
  received_by: string | null;
  remarks: string | null;
  entered_by: string | null;
  entry_date: string;
}

export interface Movement {
  id: string;
  transaction_id: string;
  moved_on: string;
  kind: MovementKind;
  item_code: string;
  quantity: number;
  from_code: string;
  to_code: string;
  receiver_name: string | null;
  cost_code: string | null;
  location_area: string | null;
  source_po_line: string | null;
  residual_pct: number | null;
  reason: string | null;
  original_transaction_id: string | null;
  remarks: string | null;
  entry_timestamp: string;
  entered_by: string | null;
}

export interface Posting {
  id: string;
  report_month: string;
  posted_at: string;
  reference: string;
  line_count: number;
  total_amount: number;
  notes: string | null;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
}

/** Everything the engine needs, in one bag. */
export interface Ledger {
  settings: Settings;
  departments: Department[];
  items: GasItem[];
  costCodes: CostCode[];
  personnel: Person[];
  suppliers: Supplier[];
  purchases: Purchase[];
  movements: Movement[];
}
