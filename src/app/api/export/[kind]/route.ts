import { NextResponse, type NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { getReport } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import {
  backchargeSheet, buildWorkbook, chargeDetailSheet, controlsSheet, dayworksSheet,
  mastersSheets, movementsSheet, purchasesSheet, statementSheet, stockSheet,
} from '@/lib/excel/workbook';

export const dynamic = 'force-dynamic';

type Kind =
  | 'workbook' | 'stock' | 'purchases' | 'movements'
  | 'backcharge' | 'statement' | 'dayworks' | 'masters';

const KINDS = new Set<Kind>([
  'workbook', 'stock', 'purchases', 'movements',
  'backcharge', 'statement', 'dayworks', 'masters',
]);

/** Dayworks doubles as a CSV so it can be pasted straight into a ledger. */
function dayworksCsv(rows: Awaited<ReturnType<typeof getReport>>['dayworks']): string {
  const header = [
    'Date', 'Period', 'From cost centre', 'To cost centre', 'Account code',
    'Description', 'Quantity', 'Unit rate', 'Amount', 'VAT', 'Cost code', 'Reference',
  ];
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = rows.map((line) =>
    [
      line.date, line.period, line.fromCostCentre, line.toCostCentre, line.accountCode,
      line.description, line.quantity, line.unitRate, line.amount, line.vat,
      line.costCode ?? '', line.reference,
    ].map(escape).join(','),
  );
  return [header.join(','), ...lines].join('\r\n');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse('Sign in first.', { status: 401 });

  const { kind } = await params;
  if (!KINDS.has(kind as Kind)) return new NextResponse('Unknown export.', { status: 404 });

  const report = await getReport();
  const month = report.reportMonth;
  const stamp = `${report.ledger.settings.store_name.replace(/[^\w-]+/g, '-')}-${month}`;

  // The dayworks export is what actually gets posted, so it goes out as CSV
  // by default; ?format=xlsx gives the formatted sheet instead.
  if (kind === 'dayworks' && request.nextUrl.searchParams.get('format') !== 'xlsx') {
    return new NextResponse(dayworksCsv(report.dayworks), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="dayworks-${stamp}.csv"`,
      },
    });
  }

  let body: Buffer;
  let name: string;

  if (kind === 'workbook') {
    body = await buildWorkbook(report);
    name = `gas-control-${stamp}.xlsx`;
  } else {
    const book = new ExcelJS.Workbook();
    book.creator = 'Gas Control';
    book.created = new Date();

    switch (kind as Kind) {
      case 'stock': stockSheet(book, report); break;
      case 'purchases': purchasesSheet(book, report); break;
      case 'movements': movementsSheet(book, report); break;
      case 'masters': mastersSheets(book, report); break;
      case 'dayworks': dayworksSheet(book, report); break;
      case 'backcharge':
        backchargeSheet(book, report);
        chargeDetailSheet(book, report);
        controlsSheet(book, report);
        break;
      case 'statement': {
        const requested = request.nextUrl.searchParams.get('department');
        const departments = report.departmentSummary.map((d) => d.code);
        const chosen = requested && departments.includes(requested) ? [requested] : departments;
        for (const department of chosen) statementSheet(book, report, department);
        break;
      }
    }

    body = Buffer.from(await book.xlsx.writeBuffer());
    name = `${kind}-${stamp}.xlsx`;
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
    },
  });
}
