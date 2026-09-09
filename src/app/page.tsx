import Link from 'next/link';
import { getReport } from '@/lib/data';
import { Badge, Card, Money, PageHeader, Stat } from '@/components/ui';
import { monthLabel } from '@/lib/engine/dates';
import { qty, shortDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const report = await getReport();
  const { settings } = report.ledger;
  const currency = settings.currency_code;
  const failing = report.controls.filter((c) => !c.pass);
  const alerts = report.stock.filter((s) => s.belowReorder);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${settings.company_name} · ${monthLabel(settings.report_month)} · valued ${settings.valuation.replace('_', ' ').toLowerCase()}`}
        actions={
          <>
            <Link href="/movements" className="btn">Record a movement</Link>
            <Link href="/backcharge" className="btn btn-primary">Backcharge report</Link>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={`Stock on hand (${currency})`}
          value={<Money value={report.totals.stockValue} />}
          hint={`${qty(report.stock.reduce((t, s) => t + s.fullInStore, 0))} full cylinders in store`}
        />
        <Stat
          label={`Month consumption (${currency})`}
          value={<Money value={report.totals.monthConsumption} />}
          hint={`${report.monthCharges.length} charge line${report.monthCharges.length === 1 ? '' : 's'}`}
        />
        <Stat
          label={`Interdepartment (${currency})`}
          value={<Money value={report.totals.interdepartment} />}
          hint={`${report.dayworks.length} line${report.dayworks.length === 1 ? '' : 's'} to post`}
        />
        <Stat
          label="Release status"
          value={report.released ? 'Released' : `${failing.length} failing`}
          tone={report.released ? 'neutral' : 'fail'}
          hint={report.released ? 'Every control passes' : 'Resolve every FAIL before posting'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card
          title="Release controls"
          description="Every control must pass before the month is posted."
          bodyClassName="scroll-x"
        >
          <table className="ledger">
            <thead>
              <tr>
                <th>Control</th>
                <th>Result</th>
                <th className="num">Count / difference</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {report.controls.map((control) => (
                <tr key={control.id}>
                  <td className="font-medium">{control.label}</td>
                  <td>
                    <Badge tone={control.pass ? 'ok' : 'fail'}>{control.pass ? 'OK' : 'Fail'}</Badge>
                  </td>
                  <td className="num">
                    {Number.isInteger(control.measure)
                      ? control.measure
                      : control.measure.toFixed(4)}
                  </td>
                  <td style={{ color: 'var(--text-soft)' }}>
                    {control.pass ? control.detail : control.action}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="grid gap-4 content-start">
          <Card title="Departments this month" bodyClassName="scroll-x">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Department</th>
                  <th className="num">Consumed</th>
                  <th className="num">Own use</th>
                  <th className="num">Net receivable</th>
                </tr>
              </thead>
              <tbody>
                {report.departmentSummary.map((dept) => (
                  <tr key={dept.code}>
                    <td>
                      <Link href={`/statement?department=${dept.code}`} className="font-medium underline">
                        {dept.code}
                      </Link>
                      <span className="ml-1.5" style={{ color: 'var(--text-soft)' }}>{dept.name}</span>
                    </td>
                    <td className="num"><Money value={dept.consumption} /></td>
                    <td className="num"><Money value={dept.ownConsumption} /></td>
                    <td className="num"><Money value={dept.netReceivable} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num"><Money value={report.totals.monthConsumption} /></td>
                  <td className="num"><Money value={report.totals.ownConsumption} /></td>
                  <td className="num">
                    <Money value={report.departmentSummary.reduce((t, d) => t + d.netReceivable, 0)} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>

          <Card
            title="Reorder alerts"
            description={alerts.length ? `${alerts.length} item(s) at or below the reorder point` : undefined}
            actions={<Link href="/stock" className="btn">Stock</Link>}
            bodyClassName="scroll-x"
          >
            {alerts.length === 0 ? (
              <p className="px-1 py-4 text-sm" style={{ color: 'var(--text-soft)' }}>
                Every item is above its reorder point.
              </p>
            ) : (
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="num">In store</th>
                    <th className="num">Reorder at</th>
                    <th className="num">Days cover</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((row) => (
                    <tr key={row.itemCode}>
                      <td>
                        <span className="font-medium">{row.itemCode}</span>
                        <span className="ml-1.5" style={{ color: 'var(--text-soft)' }}>{row.description}</span>
                      </td>
                      <td className="num">{row.fullInStore}</td>
                      <td className="num">{row.reorderPoint}</td>
                      <td className="num">
                        {row.daysCover === null ? '—' : Math.floor(row.daysCover)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>

      {(report.rowIssues.length > 0 || report.valuationIssues.length > 0) && (
        <Card
          className="mt-4"
          title="Register exceptions"
          description="Rows the model could not accept cleanly. Correct them by appending a further row."
          bodyClassName="scroll-x"
        >
          <table className="ledger">
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Category</th>
                <th>Problem</th>
              </tr>
            </thead>
            <tbody>
              {report.valuationIssues.map((issue, index) => (
                <tr key={`v-${index}`}>
                  <td className="font-mono text-xs">{issue.transactionId ?? issue.itemCode}</td>
                  <td><Badge tone="fail">valuation</Badge></td>
                  <td>{issue.message}</td>
                </tr>
              ))}
              {report.rowIssues.map((issue, index) => (
                <tr key={`r-${index}`}>
                  <td className="font-mono text-xs">{issue.transactionId}</td>
                  <td><Badge tone="warn">{issue.category}</Badge></td>
                  <td>{issue.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-5 text-xs" style={{ color: 'var(--text-soft)' }}>
        History from {shortDate(settings.history_start)}
        {settings.lock_date ? ` · locked on or before ${shortDate(settings.lock_date)}` : ''}
        {' · '}charged {settings.trigger_rule.toLowerCase().replace(/_/g, ' ')}
        {settings.honour_po_link ? ' · source PO links honoured' : ''}
      </p>
    </>
  );
}
