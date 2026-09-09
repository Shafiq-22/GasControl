import ExcelJS from 'exceljs';
import type { Report } from '@/lib/engine';
import { buildStatement } from '@/lib/engine';
import { monthLabel } from '@/lib/engine/dates';

/**
 * Excel export.
 *
 * The workbook this app replaces is still how the store's month end is
 * reviewed, signed and archived, so every report round-trips back out in the
 * same shape: one sheet per view, values only, no formulas to break.
 */

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF262C3C' },
};

interface Column {
  header: string;
  key: string;
  width?: number;
  numFmt?: string;
}

function addSheet(
  book: ExcelJS.Workbook,
  name: string,
  columns: Column[],
  rows: Record<string, unknown>[],
  title?: string[],
) {
  const sheet = book.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: (title?.length ?? 0) + 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  if (title) {
    for (const line of title) {
      const row = sheet.addRow([line]);
      row.font = { bold: true, size: line === title[0] ? 13 : 10 };
    }
    sheet.addRow([]);
  }

  sheet.columns = columns.map((column) => ({
    key: column.key,
    width: column.width ?? Math.max(12, column.header.length + 2),
    style: column.numFmt ? { numFmt: column.numFmt } : undefined,
  }));

  const header = sheet.addRow(Object.fromEntries(columns.map((c) => [c.key, c.header])));
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  header.fill = HEADER_FILL;
  header.alignment = { vertical: 'middle' };

  for (const row of rows) sheet.addRow(row);

  sheet.autoFilter = {
    from: { row: header.number, column: 1 },
    to: { row: header.number, column: columns.length },
  };

  return sheet;
}

const MONEY = '#,##0.00;[Red](#,##0.00)';
const RATE = '#,##0.0000';
const DATE = 'dd-mmm-yyyy';

function heading(report: Report, sheet: string): string[] {
  const s = report.ledger.settings;
  return [
    `${s.company_name} — ${s.store_name}`,
    `${sheet} · ${monthLabel(s.report_month)} · amounts in ${s.currency_code}`,
  ];
}

export function stockSheet(book: ExcelJS.Workbook, report: Report) {
  const departments = report.departmentSummary.map((d) => d.code);
  addSheet(
    book,
    'Stock',
    [
      { header: 'Item Code', key: 'item', width: 16 },
      { header: 'Description', key: 'description', width: 26 },
      { header: 'Full in store', key: 'full', numFmt: '#,##0.##' },
      ...departments.map((code) => ({ header: `Out ${code}`, key: `out_${code}`, numFmt: '#,##0.##' })),
      { header: 'Empties in store', key: 'empties', numFmt: '#,##0.##' },
      { header: 'Assumed empties out', key: 'assumed', numFmt: '#,##0.##' },
      { header: 'Returned to supplier', key: 'supplier', numFmt: '#,##0.##' },
      { header: 'Lost shells', key: 'lost', numFmt: '#,##0.##' },
      { header: 'Total on site', key: 'onsite', numFmt: '#,##0.##' },
      { header: 'Stock value', key: 'value', numFmt: MONEY },
      ...departments.map((code) => ({ header: `Owner ${code}`, key: `own_${code}`, numFmt: MONEY })),
      { header: 'Reorder point', key: 'reorder', numFmt: '#,##0.##' },
      { header: 'Days cover', key: 'cover', numFmt: '#,##0' },
      { header: 'Alert', key: 'alert', width: 16 },
      { header: 'Cylinder balance', key: 'cylbal', numFmt: '#,##0.####' },
      { header: 'Layer balance', key: 'laybal', numFmt: '#,##0.####' },
    ],
    report.stock.map((row) => ({
      item: row.itemCode,
      description: row.description,
      full: row.fullInStore,
      ...Object.fromEntries(departments.map((code) => [`out_${code}`, row.out.get(code) ?? 0])),
      empties: row.emptiesInStore,
      assumed: row.assumedEmptiesOut,
      supplier: row.returnedToSupplier,
      lost: row.lostShells,
      onsite: row.totalOnSite,
      value: row.stockValue,
      ...Object.fromEntries(departments.map((code) => [`own_${code}`, row.ownerStock.get(code) ?? 0])),
      reorder: row.reorderPoint,
      cover: row.daysCover === null ? null : Math.floor(row.daysCover),
      alert: row.belowMinimum ? 'BELOW MINIMUM' : row.belowReorder ? 'REORDER' : 'OK',
      cylbal: row.cylinderBalance,
      laybal: row.layerBalance,
    })),
    heading(report, 'Stock position'),
  );
}

export function purchasesSheet(book: ExcelJS.Workbook, report: Report) {
  const layerByKey = new Map(report.layers.map((l) => [l.key, l]));
  addSheet(
    book,
    'Purchases',
    [
      { header: 'Transaction ID', key: 'id', width: 14 },
      { header: 'PO date', key: 'po_date', numFmt: DATE },
      { header: 'PO no.', key: 'po_no' },
      { header: 'PO line', key: 'po_line', numFmt: '0' },
      { header: 'Vendor no.', key: 'vendor' },
      { header: 'Purchasing department', key: 'dept' },
      { header: 'Item Code', key: 'item' },
      { header: 'Qty ordered', key: 'ordered', numFmt: '#,##0.##' },
      { header: 'Unit refill rate', key: 'rate', numFmt: RATE },
      { header: 'Delivery charge', key: 'delivery', numFmt: MONEY },
      { header: 'Other charges', key: 'other', numFmt: MONEY },
      { header: 'Qty received', key: 'received', numFmt: '#,##0.##' },
      { header: 'Receipt date', key: 'receipt', numFmt: DATE },
      { header: 'Landed rate', key: 'landed', numFmt: RATE },
      { header: 'Received value', key: 'value', numFmt: MONEY },
      { header: 'Remaining', key: 'remaining', numFmt: '#,##0.##' },
      { header: 'Received by', key: 'received_by', width: 18 },
      { header: 'Entered by', key: 'entered_by', width: 22 },
      { header: 'Remarks', key: 'remarks', width: 30 },
    ],
    report.ledger.purchases.map((p) => {
      const layer = layerByKey.get(`${p.po_no}/${p.po_line}`);
      return {
        id: p.transaction_id,
        po_date: p.po_date ? new Date(p.po_date) : null,
        po_no: p.po_no,
        po_line: p.po_line,
        vendor: p.vendor_no,
        dept: p.purchasing_department,
        item: p.item_code,
        ordered: p.qty_ordered,
        rate: p.unit_refill_rate,
        delivery: p.delivery_charge,
        other: p.other_charges,
        received: p.qty_received,
        receipt: p.receipt_date ? new Date(p.receipt_date) : null,
        landed: layer?.landedRate ?? null,
        value: layer?.receivedValue ?? null,
        remaining: layer?.remaining ?? null,
        received_by: p.received_by,
        entered_by: p.entered_by,
        remarks: p.remarks,
      };
    }),
    heading(report, 'Purchase register'),
  );
}

export function movementsSheet(book: ExcelJS.Workbook, report: Report) {
  const chargeByReference = new Map<string, number>();
  for (const charge of report.charges) {
    chargeByReference.set(charge.reference, (chargeByReference.get(charge.reference) ?? 0) + charge.amount);
  }
  addSheet(
    book,
    'Movements',
    [
      { header: 'Transaction ID', key: 'id', width: 14 },
      { header: 'Date', key: 'date', numFmt: DATE },
      { header: 'Movement type', key: 'kind', width: 16 },
      { header: 'Item Code', key: 'item' },
      { header: 'Quantity', key: 'qty', numFmt: '#,##0.##' },
      { header: 'From', key: 'from' },
      { header: 'To', key: 'to' },
      { header: 'Receiver name', key: 'receiver', width: 18 },
      { header: 'Cost code', key: 'cost_code' },
      { header: 'Location / area', key: 'area' },
      { header: 'Source PO Line', key: 'source' },
      { header: 'Residual %', key: 'residual', numFmt: '0.##' },
      { header: 'Reason', key: 'reason', width: 30 },
      { header: 'Original transaction ID', key: 'original', width: 20 },
      { header: 'Charged', key: 'charged', numFmt: MONEY },
      { header: 'Entry timestamp', key: 'entry', numFmt: DATE },
      { header: 'Entered by', key: 'entered_by', width: 22 },
      { header: 'Remarks', key: 'remarks', width: 30 },
    ],
    report.ledger.movements.map((m) => ({
      id: m.transaction_id,
      date: new Date(m.moved_on),
      kind: m.kind,
      item: m.item_code,
      qty: m.quantity,
      from: m.from_code,
      to: m.to_code,
      receiver: m.receiver_name,
      cost_code: m.cost_code,
      area: m.location_area,
      source: m.source_po_line,
      residual: m.residual_pct,
      reason: m.reason,
      original: m.original_transaction_id,
      charged: chargeByReference.get(m.transaction_id) ?? null,
      entry: new Date(m.entry_timestamp),
      entered_by: m.entered_by,
      remarks: m.remarks,
    })),
    heading(report, 'Movement register'),
  );
}

export function backchargeSheet(book: ExcelJS.Workbook, report: Report) {
  const departments = report.matrix.departments;
  const sheet = book.addWorksheet('Backcharge', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  for (const line of heading(report, 'Backcharge matrix')) {
    sheet.addRow([line]).font = { bold: true, size: line.includes('—') ? 13 : 10 };
  }
  sheet.addRow([]);

  const header = sheet.addRow(['Owner \\ Consumer', ...departments, 'Total']);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = HEADER_FILL;

  for (const owner of departments) {
    const row = sheet.addRow([
      owner,
      ...departments.map((consumer) => report.matrix.cell.get(owner)!.get(consumer) ?? 0),
      report.matrix.rowTotal.get(owner) ?? 0,
    ]);
    row.eachCell((cell, index) => {
      if (index > 1) cell.numFmt = MONEY;
      // Shade the diagonal: own consumption, never settled.
      if (index === departments.indexOf(owner) + 2) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F6' } };
      }
    });
  }

  const footer = sheet.addRow([
    'Consumed',
    ...departments.map((code) => report.matrix.columnTotal.get(code) ?? 0),
    report.matrix.grandTotal,
  ]);
  footer.font = { bold: true };
  footer.eachCell((cell, index) => { if (index > 1) cell.numFmt = MONEY; });

  sheet.addRow([]);
  sheet.addRow(['Department position']).font = { bold: true };
  const positionHeader = sheet.addRow(['Department', 'Charged out', 'Charged in', 'Net receivable', 'Own use']);
  positionHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  positionHeader.fill = HEADER_FILL;
  for (const dept of report.departmentSummary) {
    const row = sheet.addRow([dept.code, dept.chargedOut, dept.chargedIn, dept.netReceivable, dept.ownConsumption]);
    row.eachCell((cell, index) => { if (index > 1) cell.numFmt = MONEY; });
  }

  sheet.addRow([]);
  sheet.addRow(['Pairwise settlement']).font = { bold: true };
  const settlementHeader = sheet.addRow(['Pays', 'Receives', 'Amount']);
  settlementHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  settlementHeader.fill = HEADER_FILL;
  for (const settlement of report.settlements) {
    const row = sheet.addRow([settlement.from, settlement.to, settlement.amount]);
    row.getCell(3).numFmt = MONEY;
  }

  sheet.columns.forEach((column) => { column.width = 18; });
  sheet.getColumn(1).width = 22;
}

export function chargeDetailSheet(book: ExcelJS.Workbook, report: Report) {
  addSheet(
    book,
    'Charge detail',
    [
      { header: 'Date', key: 'date', numFmt: DATE },
      { header: 'Owner', key: 'owner' },
      { header: 'Consumer', key: 'consumer' },
      { header: 'Item Code', key: 'item' },
      { header: 'Quantity', key: 'qty', numFmt: '#,##0.###' },
      { header: 'Unit rate', key: 'rate', numFmt: RATE },
      { header: 'Amount', key: 'amount', numFmt: MONEY },
      { header: 'Source PO', key: 'source' },
      { header: 'Cost code', key: 'cost_code' },
      { header: 'Reference', key: 'reference' },
      { header: 'Note', key: 'note', width: 30 },
    ],
    report.monthCharges.map((c) => ({
      date: new Date(c.date),
      owner: c.owner,
      consumer: c.consumer,
      item: c.itemCode,
      qty: c.quantity,
      rate: c.unitRate,
      amount: c.amount,
      source: c.sourcePo,
      cost_code: c.costCode,
      reference: c.reference,
      note: c.note,
    })),
    heading(report, 'Charge detail'),
  );
}

export function dayworksSheet(book: ExcelJS.Workbook, report: Report) {
  addSheet(
    book,
    'Dayworks',
    [
      { header: 'Date', key: 'date', numFmt: DATE },
      { header: 'Period', key: 'period' },
      { header: 'From cost centre', key: 'from' },
      { header: 'To cost centre', key: 'to' },
      { header: 'Account code', key: 'account' },
      { header: 'Description', key: 'description', width: 34 },
      { header: 'Quantity', key: 'qty', numFmt: '#,##0.###' },
      { header: 'Unit rate', key: 'rate', numFmt: RATE },
      { header: 'Amount', key: 'amount', numFmt: MONEY },
      { header: 'VAT', key: 'vat', numFmt: MONEY },
      { header: 'Cost code', key: 'cost_code' },
      { header: 'Reference', key: 'reference' },
    ],
    report.dayworks.map((line) => ({
      date: new Date(line.date),
      period: line.period,
      from: line.fromCostCentre,
      to: line.toCostCentre,
      account: line.accountCode,
      description: line.description,
      qty: line.quantity,
      rate: line.unitRate,
      amount: line.amount,
      vat: line.vat,
      cost_code: line.costCode,
      reference: line.reference,
    })),
    heading(report, 'Dayworks export'),
  );
}

export function statementSheet(book: ExcelJS.Workbook, report: Report, department: string) {
  const statement = buildStatement(report, department);
  const info = report.departmentSummary.find((d) => d.code === department);
  const sheet = book.addWorksheet(`Statement ${department}`.slice(0, 31), {
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const s = report.ledger.settings;
  sheet.addRow([`${s.company_name} — ${s.store_name}`]).font = { bold: true, size: 13 };
  sheet.addRow([`Department statement · ${department} ${info ? `(${info.name})` : ''}`]).font = { bold: true };
  sheet.addRow([`${monthLabel(s.report_month)} · cost centre ${info?.costCentre ?? '—'} · amounts in ${s.currency_code}`]);
  sheet.addRow([]);

  const header = sheet.addRow(['Item Code', 'Description', 'Quantity', 'Unit rate', 'Amount']);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = HEADER_FILL;

  for (const line of statement.lines) {
    const row = sheet.addRow([line.itemCode, line.description, line.quantity, line.unitRate, line.amount]);
    row.getCell(3).numFmt = '#,##0.###';
    row.getCell(4).numFmt = RATE;
    row.getCell(5).numFmt = MONEY;
  }

  const total = sheet.addRow(['Total consumed', '', statement.totalQuantity, '', statement.totalAmount]);
  total.font = { bold: true };
  total.getCell(3).numFmt = '#,##0.###';
  total.getCell(5).numFmt = MONEY;

  sheet.addRow([]);
  for (const [label, value] of [
    ['Own consumption', statement.ownConsumption],
    ['Payable to other departments', statement.payableToOthers],
    ['Receivable from other departments', statement.receivableFromOthers],
    ['Net receivable', statement.netReceivable],
  ] as [string, number][]) {
    const row = sheet.addRow([label, '', '', '', value]);
    row.getCell(5).numFmt = MONEY;
    if (label === 'Net receivable') row.font = { bold: true };
  }

  sheet.addRow([]);
  sheet.addRow([`${department} signature / date`]);
  sheet.addRow([`${s.custodian}, store custodian — signature / date`]);

  sheet.columns = [
    { width: 18 }, { width: 32 }, { width: 12 }, { width: 14 }, { width: 16 },
  ];
}

export function mastersSheets(book: ExcelJS.Workbook, report: Report) {
  const { ledger } = report;
  addSheet(book, 'Departments',
    [
      { header: 'Code', key: 'code' }, { header: 'Full name', key: 'name', width: 24 },
      { header: 'Cost centre', key: 'cc' }, { header: 'Contact', key: 'contact', width: 20 },
      { header: 'Active', key: 'active' },
    ],
    ledger.departments.map((d) => ({
      code: d.code, name: d.full_name, cc: d.cost_centre, contact: d.contact,
      active: d.active ? 'YES' : 'NO',
    })));

  addSheet(book, 'Gas items',
    [
      { header: 'Item Code', key: 'code', width: 16 }, { header: 'Description', key: 'description', width: 26 },
      { header: 'Gas type', key: 'type' }, { header: 'Cylinder size', key: 'size' },
      { header: 'Unit', key: 'unit' }, { header: 'Nominal content', key: 'content' },
      { header: 'Standard rate', key: 'rate', numFmt: RATE },
      { header: 'Reorder point', key: 'reorder', numFmt: '#,##0.##' },
      { header: 'Minimum stock', key: 'minimum', numFmt: '#,##0.##' },
      { header: 'Max dept holding', key: 'max', numFmt: '#,##0.##' },
      { header: 'Hazard class', key: 'hazard' }, { header: 'Active', key: 'active' },
    ],
    ledger.items.map((i) => ({
      code: i.item_code, description: i.description, type: i.gas_type, size: i.cylinder_size,
      unit: i.unit, content: i.nominal_content, rate: i.standard_rate,
      reorder: i.reorder_point, minimum: i.minimum_stock, max: i.max_dept_holding,
      hazard: i.hazard_class, active: i.active ? 'YES' : 'NO',
    })));

  addSheet(book, 'Suppliers',
    [
      { header: 'Vendor no.', key: 'no' }, { header: 'Name', key: 'name', width: 26 },
      { header: 'Contact', key: 'contact', width: 20 }, { header: 'Active', key: 'active' },
    ],
    ledger.suppliers.map((s) => ({
      no: s.vendor_no, name: s.name, contact: s.contact, active: s.active ? 'YES' : 'NO',
    })));

  addSheet(book, 'Cost codes',
    [
      { header: 'Code', key: 'code', width: 16 }, { header: 'Description', key: 'description', width: 26 },
      { header: 'Owning department', key: 'dept' }, { header: 'Active', key: 'active' },
    ],
    ledger.costCodes.map((c) => ({
      code: c.code, description: c.description, dept: c.owning_department,
      active: c.active ? 'YES' : 'NO',
    })));

  addSheet(book, 'Personnel',
    [
      { header: 'Employee no.', key: 'no' }, { header: 'Name', key: 'name', width: 24 },
      { header: 'Department', key: 'dept' }, { header: 'Active', key: 'active' },
    ],
    ledger.personnel.map((p) => ({
      no: p.employee_no, name: p.name, dept: p.department, active: p.active ? 'YES' : 'NO',
    })));
}

export function controlsSheet(book: ExcelJS.Workbook, report: Report) {
  addSheet(
    book,
    'Controls',
    [
      { header: 'Control', key: 'label', width: 28 },
      { header: 'Result', key: 'result' },
      { header: 'Count / difference', key: 'measure', numFmt: '#,##0.####' },
      { header: 'Detail', key: 'detail', width: 60 },
    ],
    report.controls.map((control) => ({
      label: control.label,
      result: control.pass ? 'OK' : 'FAIL',
      measure: control.measure,
      detail: control.pass ? control.detail : control.action,
    })),
    heading(report, 'Release controls'),
  );
}

/** The whole month end in one file, mirroring the source workbook's tabs. */
export async function buildWorkbook(report: Report): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = 'Gas Control';
  book.created = new Date();

  controlsSheet(book, report);
  stockSheet(book, report);
  purchasesSheet(book, report);
  movementsSheet(book, report);
  backchargeSheet(book, report);
  chargeDetailSheet(book, report);
  for (const dept of report.departmentSummary) statementSheet(book, report, dept.code);
  dayworksSheet(book, report);
  mastersSheets(book, report);

  return Buffer.from(await book.xlsx.writeBuffer());
}

export { addSheet, ExcelJS };
