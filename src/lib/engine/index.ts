import type { Ledger } from '@/lib/types';
import { buildLayers, standardRateMap, type CostLayer } from './layers';
import { valueLedger, type ValuationIssue, type MonthValuation } from './valuation';
import {
  buildCharges,
  buildMatrix,
  buildSettlements,
  chargesForMonth,
  type BackchargeMatrix,
  type Charge,
  type Settlement,
} from './charges';
import { buildStock, type StockRow } from './stock';
import { buildControls, releaseStatus, validateRegisters, type Control, type RowIssue } from './checks';
import { monthKey } from './dates';
import { round, sum } from './money';

export interface DepartmentSummary {
  code: string;
  name: string;
  costCentre: string;
  consumption: number;   // charged to this department, own use included
  chargedOut: number;
  chargedIn: number;
  netReceivable: number;
  ownConsumption: number;
}

export interface DayworksLine {
  date: string;
  period: string;
  fromCostCentre: string;
  toCostCentre: string;
  accountCode: string;
  description: string;
  quantity: number;
  unitRate: number;
  amount: number;
  vat: number;
  costCode: string | null;
  reference: string;
}

export interface Report {
  ledger: Ledger;
  reportMonth: string;
  layers: CostLayer[];
  months: MonthValuation[];
  charges: Charge[];
  monthCharges: Charge[];
  matrix: BackchargeMatrix;
  settlements: Settlement[];
  stock: StockRow[];
  departmentSummary: DepartmentSummary[];
  dayworks: DayworksLine[];
  rowIssues: RowIssue[];
  valuationIssues: ValuationIssue[];
  controls: Control[];
  released: boolean;
  totals: {
    receivedValue: number;
    stockValue: number;
    monthConsumption: number;
    interdepartment: number;
    ownConsumption: number;
  };
}

/**
 * Runs the whole model: cost layers, monthly FIFO, charge lines, the
 * backcharge matrix, the stock position and the release controls.
 *
 * Pure — same ledger in, same report out. Every screen renders from this.
 */
export function buildReport(ledger: Ledger): Report {
  const { settings } = ledger;
  const reportMonth = monthKey(settings.report_month);
  const decimals = settings.posting_decimals;

  const standardRates = standardRateMap(ledger);
  const layers = buildLayers(ledger.purchases, settings, standardRates);

  const valuation = valueLedger(ledger.movements, layers, settings, standardRates);
  const charges = buildCharges(ledger.movements, valuation.movements, settings);
  const monthCharges = chargesForMonth(charges, reportMonth);

  const activeDepartments = [...ledger.departments]
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
    .filter((d) => d.active);
  const departmentCodes = activeDepartments.map((d) => d.code);

  const matrix = buildMatrix(monthCharges, departmentCodes);
  const settlements = buildSettlements(matrix, settings.tolerance);

  const stock = buildStock(
    ledger.items,
    ledger.purchases,
    ledger.movements,
    valuation.layers,
    settings,
    departmentCodes,
  );

  const departmentSummary: DepartmentSummary[] = activeDepartments.map((d) => ({
    code: d.code,
    name: d.full_name,
    costCentre: d.cost_centre,
    consumption: round(matrix.columnTotal.get(d.code) ?? 0, decimals),
    chargedOut: round(matrix.chargedOut.get(d.code) ?? 0, decimals),
    chargedIn: round(matrix.chargedIn.get(d.code) ?? 0, decimals),
    netReceivable: round(matrix.netReceivable.get(d.code) ?? 0, decimals),
    ownConsumption: round(matrix.ownConsumption.get(d.code) ?? 0, decimals),
  }));

  const costCentreOf = new Map(ledger.departments.map((d) => [d.code, d.cost_centre]));
  // Own consumption stays inside one department, so it is not a dayworks
  // transfer. Only cross-department lines get posted.
  const dayworks: DayworksLine[] = monthCharges
    .filter((c) => c.owner !== c.consumer && c.amount !== 0)
    .map((c) => ({
      date: c.date,
      period: c.month.replace('-', ''),
      fromCostCentre: costCentreOf.get(c.owner) ?? c.owner,
      toCostCentre: costCentreOf.get(c.consumer) ?? c.consumer,
      accountCode: settings.posting_account,
      description: `Gas ${c.itemCode} - ${c.reference}`,
      quantity: c.quantity,
      unitRate: c.unitRate,
      amount: c.amount,
      vat: round(c.amount * settings.backcharge_vat_rate, decimals),
      costCode: c.costCode,
      reference: c.reference,
    }));

  const rowIssues = validateRegisters(ledger, layers);
  const controls = buildControls({
    ledger,
    layers,
    stock,
    charges,
    monthCharges,
    matrix,
    rowIssues,
    valuationIssues: valuation.issues,
  });

  return {
    ledger,
    reportMonth,
    layers,
    months: valuation.months,
    charges,
    monthCharges,
    matrix,
    settlements,
    stock,
    departmentSummary,
    dayworks,
    rowIssues,
    valuationIssues: valuation.issues,
    controls,
    released: releaseStatus(controls).released,
    totals: {
      receivedValue: round(sum(layers.map((l) => l.receivedValue)), decimals),
      stockValue: round(sum(stock.map((s) => s.stockValue)), decimals),
      monthConsumption: round(sum(monthCharges.map((c) => c.amount)), decimals),
      interdepartment: round(
        sum(monthCharges.filter((c) => c.owner !== c.consumer).map((c) => c.amount)),
        decimals,
      ),
      ownConsumption: round(
        sum(monthCharges.filter((c) => c.owner === c.consumer).map((c) => c.amount)),
        decimals,
      ),
    },
  };
}

/** The per-item lines behind one department's statement for the month. */
export interface StatementLine {
  itemCode: string;
  description: string;
  quantity: number;
  amount: number;
  unitRate: number;
}

export function buildStatement(report: Report, department: string) {
  const { ledger, monthCharges } = report;
  const decimals = ledger.settings.posting_decimals;
  const mine = monthCharges.filter((c) => c.consumer === department);

  const lines: StatementLine[] = ledger.items
    .map((item) => {
      const forItem = mine.filter((c) => c.itemCode === item.item_code);
      const quantity = sum(forItem.map((c) => c.quantity));
      const amount = sum(forItem.map((c) => c.amount));
      return {
        itemCode: item.item_code,
        description: item.description,
        quantity: round(quantity, 2),
        amount: round(amount, decimals),
        unitRate: quantity !== 0 ? round(amount / quantity, 4) : 0,
      };
    })
    .filter((line) => line.quantity !== 0 || line.amount !== 0);

  const own = mine.filter((c) => c.owner === department);
  const external = mine.filter((c) => c.owner !== department);

  return {
    department,
    lines,
    detail: mine,
    totalQuantity: round(sum(lines.map((l) => l.quantity)), 2),
    totalAmount: round(sum(lines.map((l) => l.amount)), decimals),
    ownConsumption: round(sum(own.map((c) => c.amount)), decimals),
    payableToOthers: round(sum(external.map((c) => c.amount)), decimals),
    receivableFromOthers: round(
      sum(monthCharges.filter((c) => c.owner === department && c.consumer !== department).map((c) => c.amount)),
      decimals,
    ),
    netReceivable: round(report.matrix.netReceivable.get(department) ?? 0, decimals),
  };
}

export type Statement = ReturnType<typeof buildStatement>;

export * from './money';
export * from './dates';
export type { CostLayer } from './layers';
export type { Charge, BackchargeMatrix, Settlement } from './charges';
export type { StockRow } from './stock';
export type { Control, RowIssue } from './checks';
export type { ValuationIssue, MonthValuation } from './valuation';
