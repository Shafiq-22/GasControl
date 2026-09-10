import { canRecord, getPostings, getProfile, getReport } from '@/lib/data';
import { Card, DownloadLink, Money, Notice, PageHeader } from '@/components/ui';
import { monthLabel } from '@/lib/engine/dates';
import { qty, shortDate } from '@/lib/format';
import { PostingForm } from './form';

export const dynamic = 'force-dynamic';

export default async function DayworksPage() {
  const [report, postings, profile] = await Promise.all([getReport(), getPostings(), getProfile()]);
  const { settings } = report.ledger;
  const alreadyPosted = postings.find((p) => p.report_month.slice(0, 7) === report.reportMonth);

  const totalAmount = report.dayworks.reduce((t, l) => t + l.amount, 0);
  const totalVat = report.dayworks.reduce((t, l) => t + l.vat, 0);

  return (
    <>
      <PageHeader
        title="Dayworks export"
        subtitle={`Cross-department lines for ${monthLabel(settings.report_month)}, ready for the accounting system. Own consumption is excluded.`}
        actions={<DownloadLink href="/api/export/dayworks" primary>Download CSV</DownloadLink>}
      />

      {alreadyPosted && (
        <div className="mb-4">
          <Notice tone="ok">
            {monthLabel(settings.report_month)} was posted on {shortDate(alreadyPosted.posted_at.slice(0, 10))}
            {' '}under reference <strong>{alreadyPosted.reference}</strong>
            {' '}({alreadyPosted.line_count} lines, {settings.currency_code} {alreadyPosted.total_amount}).
          </Notice>
        </div>
      )}

      {!report.released && !alreadyPosted && (
        <div className="mb-4">
          <Notice tone="fail">
            Release is blocked: {report.controls.filter((c) => !c.pass).length} control(s) are
            failing. Post only once every control on the dashboard passes.
          </Notice>
        </div>
      )}

      <Card title={`${report.dayworks.length} line(s) to post`} bodyClassName="scroll-x">
        <table className="ledger">
          <thead>
            <tr>
              <th>Date</th>
              <th>Period</th>
              <th>From cost centre</th>
              <th>To cost centre</th>
              <th>Account</th>
              <th>Description</th>
              <th className="num">Qty</th>
              <th className="num">Unit rate</th>
              <th className="num">Amount</th>
              <th className="num">VAT</th>
              <th>Cost code</th>
            </tr>
          </thead>
          <tbody>
            {report.dayworks.map((line, index) => (
              <tr key={`${line.reference}-${index}`}>
                <td>{shortDate(line.date)}</td>
                <td className="font-mono text-xs">{line.period}</td>
                <td>{line.fromCostCentre}</td>
                <td>{line.toCostCentre}</td>
                <td className="font-mono text-xs">{line.accountCode}</td>
                <td>{line.description}</td>
                <td className="num">{qty(line.quantity)}</td>
                <td className="num"><Money value={line.unitRate} decimals={4} /></td>
                <td className="num"><Money value={line.amount} /></td>
                <td className="num"><Money value={line.vat} /></td>
                <td>{line.costCode ?? '—'}</td>
              </tr>
            ))}
            {report.dayworks.length === 0 && (
              <tr><td colSpan={11} style={{ color: 'var(--text-soft)' }}>
                No cross-department charges in {monthLabel(settings.report_month)}.
              </td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={8}>Total</td>
              <td className="num"><Money value={totalAmount} /></td>
              <td className="num"><Money value={totalVat} /></td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {canRecord(profile) && !alreadyPosted && report.dayworks.length > 0 && (
          <Card
            title="Record the posting"
            description="Keep the accounting reference with the month so it is never posted twice."
          >
            <PostingForm
              reportMonth={settings.report_month}
              lineCount={report.dayworks.length}
              totalAmount={totalAmount}
              blocked={!report.released}
            />
          </Card>
        )}

        <Card title="Posting history" bodyClassName="scroll-x">
          <table className="ledger">
            <thead>
              <tr>
                <th>Month</th><th>Posted</th><th>Reference</th>
                <th className="num">Lines</th><th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {postings.map((posting) => (
                <tr key={posting.id}>
                  <td>{monthLabel(posting.report_month)}</td>
                  <td>{shortDate(posting.posted_at.slice(0, 10))}</td>
                  <td className="font-mono text-xs">{posting.reference}</td>
                  <td className="num">{posting.line_count}</td>
                  <td className="num"><Money value={posting.total_amount} /></td>
                </tr>
              ))}
              {postings.length === 0 && (
                <tr><td colSpan={5} style={{ color: 'var(--text-soft)' }}>Nothing posted yet.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
