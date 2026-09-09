import ExcelJS from 'exceljs';
import JSZip from 'jszip';

/**
 * Excel import.
 *
 * Reads the source workbook (00_README … 09_DAYWORKS) as well as the sheets
 * this app exports, so a store can move across in one go and keep using
 * Excel for bulk edits afterwards.
 *
 * Sheets are matched loosely by name and columns by header text, because the
 * workbook's own sheets are numbered (03_MASTERS) while ours are not, and a
 * user's copy may have been renamed.
 */

export interface ImportRow {
  sheet: string;
  rowNumber: number;
  values: Record<string, string>;
}

export interface ParsedWorkbook {
  departments: ImportRow[];
  items: ImportRow[];
  suppliers: ImportRow[];
  costCodes: ImportRow[];
  personnel: ImportRow[];
  purchases: ImportRow[];
  movements: ImportRow[];
  warnings: string[];
}

const normalise = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Reads a cell as plain text, flattening dates, formulas and rich text. */
function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('result' in value && value.result !== undefined) {
      const result = value.result;
      if (result instanceof Date) return result.toISOString().slice(0, 10);
      if (typeof result === 'object' && result !== null && 'error' in result) return '';
      return String(result).trim();
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('').trim();
    }
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    return '';
  }
  return String(value).trim();
}

/**
 * Finds the header row by looking for the row that carries the most of the
 * expected headings, then reads every row beneath it.
 */
function readTable(
  sheet: ExcelJS.Worksheet,
  expected: string[],
  searchLimit = 200,
): { rows: ImportRow[]; matched: string[] } {
  const wanted = new Set(expected.map(normalise));

  let headerRow = 0;
  let bestScore = 0;
  let headers: Record<number, string> = {};

  const lastSearchRow = Math.min(sheet.rowCount, searchLimit);
  for (let r = 1; r <= lastSearchRow; r += 1) {
    const row = sheet.getRow(r);
    const candidate: Record<number, string> = {};
    let score = 0;
    row.eachCell({ includeEmpty: false }, (cell, column) => {
      const text = cellText(cell);
      if (!text) return;
      const key = normalise(text);
      candidate[column] = key;
      if (wanted.has(key)) score += 1;
    });
    if (score > bestScore) {
      bestScore = score;
      headerRow = r;
      headers = candidate;
    }
  }

  // Fewer than two recognised headings means this is not the table we want.
  if (headerRow === 0 || bestScore < 2) return { rows: [], matched: [] };

  const rows: ImportRow[] = [];
  for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const values: Record<string, string> = {};
    let populated = false;

    for (const [column, key] of Object.entries(headers)) {
      const text = cellText(row.getCell(Number(column)));
      if (text) populated = true;
      values[key] = text;
    }

    if (populated) rows.push({ sheet: sheet.name, rowNumber: r, values });
  }

  return { rows, matched: Object.values(headers) };
}

/** Picks the worksheet whose name best matches any of the given aliases. */
function findSheet(book: ExcelJS.Workbook, aliases: string[]): ExcelJS.Worksheet | null {
  const keys = aliases.map(normalise);
  let fallback: ExcelJS.Worksheet | null = null;

  for (const sheet of book.worksheets) {
    const name = normalise(sheet.name);
    if (keys.some((key) => name === key)) return sheet;
    if (!fallback && keys.some((key) => name.includes(key))) fallback = sheet;
  }
  return fallback;
}

/**
 * Sheets worth parsing. Everything else in the source workbook is either a
 * derived report or the hidden helper grid, and ZZ_CALC alone holds around
 * 2.4 million formula cells — parsing it costs half a minute and tells us
 * nothing, since the app recomputes every derived figure itself.
 */
const WANTED_SHEETS = [
  'MASTERS', 'PURCHASES', 'MOVEMENTS',
  'DEPARTMENTS', 'GASITEMS', 'ITEMS', 'SUPPLIERS', 'COSTCODES', 'PERSONNEL',
];

const EMPTY_SHEET =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<sheetData/></worksheet>';

const EMPTY_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>';

/**
 * Rewrites the uploaded file into something small and safe to parse.
 *
 * Two things are done, both of which only ever remove information the
 * importer does not read:
 *
 *  - every defined name is dropped. The source workbook builds its dropdown
 *    ranges with INDEX and COUNTIF, and exceljs throws while reconciling a
 *    defined name whose value is not a plain reference.
 *  - worksheets we do not read are replaced with an empty sheet, along with
 *    their relationships, so their cells and tables are never parsed.
 *
 * Structure is left intact throughout: parts are emptied, never deleted, so
 * every relationship and content type still resolves.
 */
async function prepareWorkbook(data: ArrayBuffer): Promise<{
  buffer: ArrayBuffer;
  skipped: string[];
}> {
  const zip = await JSZip.loadAsync(data);
  const workbookEntry = zip.file('xl/workbook.xml');
  if (!workbookEntry) throw new Error('This file is not a workbook: xl/workbook.xml is missing.');

  const workbookXml = await workbookEntry.async('string');
  const relsXml = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) ?? '';

  // r:id -> part path, so a sheet entry can be traced to its worksheet file.
  const targets = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const tag = match[0];
    const id = /Id="([^"]+)"/.exec(tag)?.[1];
    const target = /Target="([^"]+)"/.exec(tag)?.[1];
    if (!id || !target) continue;
    targets.set(id, target.replace(/^\/?(xl\/)?/, ''));
  }

  const skipped: string[] = [];
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const tag = match[0];
    const name = /name="([^"]+)"/.exec(tag)?.[1];
    const id = /r:id="([^"]+)"/.exec(tag)?.[1];
    if (!name || !id) continue;

    const key = normalise(name);
    if (WANTED_SHEETS.some((wanted) => key.includes(normalise(wanted)))) continue;

    const target = targets.get(id);
    if (!target || !zip.file(`xl/${target}`)) continue;

    zip.file(`xl/${target}`, EMPTY_SHEET);
    const partName = target.split('/').pop()!;
    const sheetRels = `xl/worksheets/_rels/${partName}.rels`;
    if (zip.file(sheetRels)) zip.file(sheetRels, EMPTY_RELS);
    skipped.push(name);
  }

  zip.file(
    'xl/workbook.xml',
    workbookXml.replace(/<definedNames>[\s\S]*?<\/definedNames>/g, ''),
  );

  return { buffer: await zip.generateAsync({ type: 'arraybuffer' }), skipped };
}

export async function parseWorkbook(data: ArrayBuffer): Promise<ParsedWorkbook> {
  const warnings: string[] = [];
  const { buffer, skipped } = await prepareWorkbook(data);

  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);

  if (skipped.length > 0) {
    warnings.push(
      `Only master and register sheets are read. Skipped: ${skipped.join(', ')}.`,
    );
  }

  // The source workbook keeps all five master tables on one sheet, so each
  // table is located by its own headings rather than by position.
  const masters = findSheet(book, ['03_MASTERS', 'MASTERS']);
  const departmentsSheet = findSheet(book, ['Departments']) ?? masters;
  const itemsSheet = findSheet(book, ['Gas items', 'Items']) ?? masters;
  const suppliersSheet = findSheet(book, ['Suppliers']) ?? masters;
  const costCodesSheet = findSheet(book, ['Cost codes']) ?? masters;
  const personnelSheet = findSheet(book, ['Personnel']) ?? masters;

  const purchasesSheet = findSheet(book, ['04_PURCHASES', 'Purchases']);
  const movementsSheet = findSheet(book, ['05_MOVEMENTS', 'Movements']);

  const read = (
    sheet: ExcelJS.Worksheet | null | undefined,
    label: string,
    expected: string[],
  ): ImportRow[] => {
    if (!sheet) {
      warnings.push(`No sheet found for ${label}.`);
      return [];
    }
    const { rows } = readTable(sheet, expected);
    if (rows.length === 0) warnings.push(`No ${label} rows found on "${sheet.name}".`);
    return rows;
  };

  return {
    departments: read(departmentsSheet, 'departments', ['Code', 'Full name', 'Cost centre', 'Contact', 'Active']),
    items: read(itemsSheet, 'gas items', [
      'Item Code', 'Description', 'Gas type', 'Cylinder size', 'Unit',
      'Nominal content', 'Standard rate', 'Hazard class', 'Active',
    ]),
    suppliers: read(suppliersSheet, 'suppliers', ['Vendor no.', 'Name', 'Contact', 'Active']),
    costCodes: read(costCodesSheet, 'cost codes', ['Code', 'Description', 'Owning department', 'Active']),
    personnel: read(personnelSheet, 'personnel', ['Name', 'Employee no.', 'Department', 'Active']),
    purchases: read(purchasesSheet, 'purchases', [
      'Transaction ID', 'PO date', 'PO no.', 'PO line', 'Vendor no.',
      'Purchasing department', 'Item Code', 'Qty ordered', 'Unit refill rate',
      'Delivery charge', 'Other charges', 'Qty received', 'Receipt date',
      'Received by', 'Remarks', 'Entered by',
    ]),
    movements: read(movementsSheet, 'movements', [
      'Transaction ID', 'Date', 'Movement type', 'Item Code', 'Quantity',
      'From', 'To', 'Receiver name', 'Cost code', 'Location / area',
      'Source PO Line', 'Residual %', 'Reason', 'Original transaction ID',
      'Remarks', 'Entry timestamp', 'Entered by',
    ]),
    warnings,
  };
}

// --------------------------------------------------------------- coercion

export const text = (row: ImportRow, ...keys: string[]): string | null => {
  for (const key of keys) {
    const value = row.values[normalise(key)];
    if (value) return value;
  }
  return null;
};

export const number = (row: ImportRow, ...keys: string[]): number | null => {
  const raw = text(row, ...keys);
  if (raw === null) return null;
  // Tolerate thousands separators, currency symbols and stray spaces.
  const cleaned = raw.replace(/[^0-9.eE+-]/g, '');
  if (cleaned === '') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

export const date = (row: ImportRow, ...keys: string[]): string | null => {
  const raw = text(row, ...keys);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  // Excel serial dates survive as bare numbers when a column is unformatted.
  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + serial * 86_400_000).toISOString().slice(0, 10);
  }

  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
};

export const yesNo = (row: ImportRow, ...keys: string[]): boolean => {
  const raw = text(row, ...keys);
  if (raw === null) return true; // absent means active, matching the workbook
  return /^(yes|y|true|1|active)$/i.test(raw);
};

export { normalise };
