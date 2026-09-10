import Link from 'next/link';
import { getReport } from '@/lib/data';
import { buildStatement } from '@/lib/engine';
import { Card, DownloadLink, Money, PageHeader } from '@/components/ui';
import { monthLabel } from '@/lib/engine/dates';
import { qty, shortDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function StatementPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string }>;
}) {
  const [report, params] = await Promise.all([getReport(), searchParams]);
  const { settings } = report.ledger;
  const departments = report.departmentSummary;

  const selected =
    departments.find((d) => d.code === params.department)?.code ?? departments[0]?.code;

  if (!selected) {
    return (
      <>
        <PageHeader title="Statements" />
        <Card><p className="text-sm">Add a department in Masters first.</p></Card>
      </>
    );
  }

  const statement = buildStatement(report, selected);
  const detail = statement.detail;

  return (
    <>
      <PageHeader
        title="Department statement"
        subtitle={`${settings.company_name} · ${settings.store_name} · ${monthLabel(settings.report_month)}`}
        actions={
          <>
            <DownloadLink href={`/api/export/statement?department=${selected}`}>Export</DownloadLink>
          </>
        }
      />

      <div className="no-print mb-4 flex flex-wrap gap-1.5">
        {departments.map((dept) => (
          <Link
            key={dept.code}
            href={`/statement?department=${dept.code}`}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={
              dept.code === selected
                ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)' }
                : { borderColor: 'var(--line)' }
            }
          >
            {dept.code}
          </Link>
        ))}
      </div>

      <Card
        title={`${selected} · ${departments.find((d) => d.code === selected)?.name}`}
        description={`Cost centre ${departments.find((d) => d.code === selected)?.costCentre}`}
        bodyClassName="scroll-x"
      >
        <table className="ledger">
          <thead>
            <tr>
              <th>Item</th>
              <th>Description</th>
              <th className="num">Quantity</th>
              <th className="num">Unit rate</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {statement.lines.map((line) => (
              <tr key={line.itemCode}>
                <td className="font-medium">{line.itemCode}</td>
                <td>{line.description}</td>
                <td className="num">{qty(line.quantity)}</td>
                <td className="num"><Money value={line.unitRate} decimals={4} /></td>
                <td className="num"><Money value={line.amount} /></td>
              </tr>
            ))}
            {statement.lines.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--text-soft)' }}>
                {selected} consumed nothing in {monthLabel(settings.report_month)}.
              </td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total consumed</td>
              <td className="num">{qty(statement.totalQuantity)}</td>
              <td />
              <td className="num"><Money value={statement.totalAmount} /></td>
            </tr>
          </tfoot>
        </table>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Position">
          <dl className="grid gap-2 text-sm">
            {[
              ['Own consumption', statement.ownConsumption, 'Gas this department bought and used itself'],
              ['Payable to other departments', statement.payableToOthers, 'Gas used that another department paid for'],
              ['Receivable from other departments', statement.receivableFromOthers, 'Gas this department bought that others used'],
            ].map(([label, value, hint]) => (
              <div key={label as string} className="flex items-baseline justify-between gap-4">
                <dt>
                  {label as string}
                  <div className="text-xs" style={{ color: 'var(--text-soft)' }}>{hint as string}</div>
                </dt>
                <dd className="num shrink-0 font-medium"><Money value={value as number} /></dd>
              </div>
            ))}
            <div className="mt-1 flex items-baseline justify-between gap-4 border-t pt-2"
                 style={{ borderColor: 'var(--line)' }}>
              <dt className="font-semibold">Net receivable</dt>
              <dd className="num shrink-0 font-semibold"><Money value={statement.netReceivable} /></dd>
            </div>
          </dl>

          <div className="mt-5 grid gap-6 border-t pt-5 text-xs" style={{ borderColor: 'var(--line)' }}>
            <div>
              <div className="h-9 border-b" style={{ borderColor: 'var(--line)' }} />
              <div className="mt-1" style={{ color: 'var(--text-soft)' }}>
                {selected} · date
              </div>
            </div>
            <div>
              <div className="h-9 border-b" style={{ borderColor: 'var(--line)' }} />
              <div className="mt-1" style={{ color: 'var(--text-soft)' }}>
                {settings.custodian}, store custodian · date
              </div>
            </div>
          </div>
        </Card>

        <Card title={`Detail · ${detail.length} line(s)`} bodyClassName="scroll-x">
          <table className="ledger">
            <thead>
              <tr>
                <th>Date</th>
                <th>Owner</th>
                <th>Item</th>
                <th className="num">Qty</th>
                <th className="num">Rate</th>
                <th className="num">Amount</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {detail.map((charge, index) => (
                <tr key={`${charge.reference}-${index}`}>
                  <td>{shortDate(charge.date)}</td>
                  <td>{charge.owner === selected ? `${charge.owner} (own)` : charge.owner}</td>
                  <td>{charge.itemCode}</td>
                  <td className="num">{qty(charge.quantity)}</td>
                  <td className="num"><Money value={charge.unitRate} decimals={4} /></td>
                  <td className="num"><Money value={charge.amount} /></td>
                  <td className="font-mono text-xs">{charge.reference}</td>
                </tr>
              ))}
              {detail.length === 0 && (
                <tr><td colSpan={7} style={{ color: 'var(--text-soft)' }}>Nothing to show.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
