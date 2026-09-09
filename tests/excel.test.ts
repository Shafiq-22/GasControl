import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildReport } from '@/lib/engine';
import { buildWorkbook } from '@/lib/excel/workbook';
import { date, number, parseWorkbook, text, yesNo } from '@/lib/excel/import';
import { demoLedger } from './fixtures';

const report = buildReport(demoLedger());

/** exceljs takes an ArrayBuffer; Node hands back a Buffer view of one. */
const bytes = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

/**
 * The real workbook this app replaces. Present when the fixture has been
 * copied in; the round-trip tests below cover the same ground without it.
 */
const SOURCE = process.env.GAS_CONTROL_SOURCE_WORKBOOK;

describe('export', () => {
  it('writes a readable workbook with a sheet per view', async () => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes(await buildWorkbook(report)));

    const names = book.worksheets.map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'Controls', 'Stock', 'Purchases', 'Movements', 'Backcharge',
        'Charge detail', 'Dayworks', 'Departments', 'Gas items',
        'Suppliers', 'Cost codes', 'Personnel',
        'Statement BAF', 'Statement WOR', 'Statement BAA',
      ]),
    );
  });

  it('carries the backcharge figures, not a picture of them', async () => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes(await buildWorkbook(report)));
    const sheet = book.getWorksheet('Backcharge')!;

    // Find the matrix header, then read the BAF row.
    let headerRow = 0;
    sheet.eachRow((row, index) => {
      if (String(row.getCell(1).value ?? '').startsWith('Owner')) headerRow = index;
    });
    expect(headerRow).toBeGreaterThan(0);

    const bafRow = sheet.getRow(headerRow + 1);
    expect(bafRow.getCell(1).value).toBe('BAF');
    expect(bafRow.getCell(2).value).toBe(1000); // BAF -> BAF own use
    expect(bafRow.getCell(3).value).toBe(4250); // BAF -> WOR
    expect(bafRow.getCell(4).value).toBe(1350); // BAF -> BAA
  });

  it('totals the dayworks sheet to the interdepartment charge', async () => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes(await buildWorkbook(report)));
    const sheet = book.getWorksheet('Dayworks')!;

    let total = 0;
    let amountColumn = 0;
    sheet.eachRow((row) => {
      row.eachCell((cell, column) => {
        if (cell.value === 'Amount') amountColumn = column;
      });
    });
    sheet.eachRow((row, index) => {
      if (index <= 4 || amountColumn === 0) return;
      const value = row.getCell(amountColumn).value;
      if (typeof value === 'number') total += value;
    });
    expect(total).toBeCloseTo(report.totals.interdepartment, 2);
  });
});

describe('import', () => {
  it('reads back a workbook this app exported', async () => {
    const parsed = await parseWorkbook(bytes(await buildWorkbook(report)));

    expect(parsed.departments.map((r) => text(r, 'Code'))).toEqual(['BAF', 'WOR', 'BAA']);
    expect(parsed.items).toHaveLength(6);
    expect(parsed.suppliers).toHaveLength(1);
    expect(parsed.costCodes).toHaveLength(3);
    expect(parsed.personnel).toHaveLength(3);
    expect(parsed.purchases).toHaveLength(9);
    expect(parsed.movements).toHaveLength(17);

    const oxygen = parsed.purchases.find((r) => text(r, 'PO no.') === 'DEMO-PO3')!;
    expect(number(oxygen, 'Unit refill rate')).toBe(300);
    expect(date(oxygen, 'Receipt date')).toBe('2026-09-01');
    expect(text(oxygen, 'Purchasing department')).toBe('BAF');

    const transfer = parsed.movements.find((r) => text(r, 'Movement type') === 'TRANSFER')!;
    expect(text(transfer, 'Original transaction ID')).toBe('M-000005');
    expect(number(transfer, 'Quantity')).toBe(2);
  });

  it('coerces yes/no, blanks and Excel serial dates', () => {
    const row = (values: Record<string, string>) => ({ sheet: 's', rowNumber: 1, values });
    expect(yesNo(row({ active: 'YES' }), 'Active')).toBe(true);
    expect(yesNo(row({ active: 'no' }), 'Active')).toBe(false);
    expect(yesNo(row({}), 'Active')).toBe(true);
    expect(number(row({ qtyordered: '1,250.50' }), 'Qty ordered')).toBe(1250.5);
    expect(number(row({ qtyordered: '' }), 'Qty ordered')).toBe(null);
    expect(date(row({ podate: '46266' }), 'PO date')).toBe('2026-09-01');
    expect(date(row({ podate: 'not a date' }), 'PO date')).toBe(null);
  });
});

describe.skipIf(!SOURCE || !existsSync(SOURCE))('the source workbook', () => {
  it('reads the original 03/04/05 sheets', async () => {
    const started = Date.now();
    const parsed = await parseWorkbook(bytes(readFileSync(SOURCE!)));
    const elapsed = Date.now() - started;

    // Master tables all share sheet 03_MASTERS and are found by their headings.
    expect(parsed.departments.length).toBeGreaterThanOrEqual(3);
    expect(parsed.items.length).toBeGreaterThanOrEqual(6);
    expect(parsed.purchases.length).toBeGreaterThanOrEqual(9);
    expect(parsed.movements.length).toBeGreaterThanOrEqual(17);

    const codes = parsed.departments.map((r) => text(r, 'Code'));
    expect(codes).toEqual(expect.arrayContaining(['BAF', 'WOR', 'BAA']));

    const items = parsed.items.map((r) => text(r, 'Item Code'));
    expect(items).toEqual(expect.arrayContaining(['DEMO-O2', 'DEMO-AC', 'DEMO-N2']));

    const firstPo = parsed.purchases.find((r) => text(r, 'PO no.') === 'DEMO-PO1')!;
    expect(number(firstPo, 'Unit refill rate')).toBe(250);
    expect(number(firstPo, 'Qty received')).toBe(10);
    expect(date(firstPo, 'PO date')).toBe('2026-07-01');

    const kinds = new Set(parsed.movements.map((r) => text(r, 'Movement type')));
    expect(kinds).toContain('ISSUE');
    expect(kinds).toContain('RETURN_UNUSED');
    expect(kinds).toContain('TRANSFER');

    // The helper and report sheets are skipped, so a 24 MB workbook parses in
    // seconds rather than the best part of a minute.
    expect(parsed.warnings.some((w) => w.includes('Skipped'))).toBe(true);
    expect(elapsed).toBeLessThan(20_000);
  }, 120_000);
});
