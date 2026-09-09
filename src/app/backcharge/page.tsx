import { getReport } from '@/lib/data';
import { Card, DownloadLink, Money, Notice, PageHeader } from '@/components/ui';
import { monthLabel } from '@/lib/engine/dates';
import { qty, shortDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function BackchargePage() {
  const report = await getReport();
  const { settings } = report.ledger;
  const { matrix } = report;
  const departments = matrix.departments;

  return (
    <>
      <PageHeader
        title="Backcharge"
        subtitle={`${settings.company_name} · ${settings.store_name} · ${monthLabel(settings.report_month)}`}
        actions={<DownloadLink href="/api/export/backcharge">Export</DownloadLink>}
      />

      {!report.released && (
        <div className="mb-4">
          <Notice tone="fail">
            {report.controls.filter((c) => !c.pass).length} control(s) are failing. Resolve every
            FAIL on the dashboard before releasing this month.
          </Notice>
        </div>
      )}

      <Card
        title="Owner to consumer"
        description={`Rows paid for the gas, columns used it. Amounts in ${settings.currency_code}.`}
        bodyClassName="scroll-x"
      >
        <table className="ledger">
          <thead>
            <tr>
              <th>Owner \ Consumer</th>
              {departments.map((code) => <th key={code} className="num">{code}</th>)}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((owner) => (
              <tr key={owner}>
                <td className="font-medium">{owner}</td>
                {departments.map((consumer) => {
                  const value = matrix.cell.get(owner)!.get(consumer) ?? 0;
                  const diagonal = owner === consumer;
                  return (
                    <td
                      key={consumer}
                      className="num"
                      style={diagonal ? { background: 'var(--canvas)' } : undefined}
                      title={diagonal ? `${owner} using gas it bought itself` : `${owner} recharges ${consumer}`}
                    >
                      <Money value={value} />
                    </td>
                  );
                })}
                <td className="num font-semibold"><Money value={matrix.rowTotal.get(owner) ?? 0} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Consumed</td>
              {departments.map((code) => (
                <td key={code} className="num"><Money value={matrix.columnTotal.get(code) ?? 0} /></td>
              ))}
              <td className="num"><Money value={matrix.grandTotal} /></td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-3 text-xs" style={{ color: 'var(--text-soft)' }}>
          The shaded diagonal is own consumption: a department using gas it bought itself.
          It is reported but never settled between departments.
        </p>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Department position" bodyClassName="scroll-x">
          <table className="ledger">
            <thead>
              <tr>
                <th>Department</th>
                <th className="num">Charged out</th>
                <th className="num">Charged in</th>
                <th className="num">Net receivable</th>
                <th className="num">Own use</th>
              </tr>
            </thead>
            <tbody>
              {report.departmentSummary.map((dept) => (
                <tr key={dept.code}>
                  <td>
                    <span className="font-medium">{dept.code}</span>
                    <div className="text-xs" style={{ color: 'var(--text-soft)' }}>{dept.name}</div>
                  </td>
                  <td className="num"><Money value={dept.chargedOut} /></td>
                  <td className="num"><Money value={dept.chargedIn} /></td>
                  <td className="num font-semibold"><Money value={dept.netReceivable} /></td>
                  <td className="num"><Money value={dept.ownConsumption} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num"><Money value={report.departmentSummary.reduce((t, d) => t + d.chargedOut, 0)} /></td>
                <td className="num"><Money value={report.departmentSummary.reduce((t, d) => t + d.chargedIn, 0)} /></td>
                <td className="num"><Money value={report.departmentSummary.reduce((t, d) => t + d.netReceivable, 0)} /></td>
                <td className="num"><Money value={report.totals.ownConsumption} /></td>
              </tr>
            </tfoot>
          </table>
        </Card>

        <Card
          title="Pairwise settlement"
          description="Each pair nets down to a single payment."
          bodyClassName="scroll-x"
        >
          {report.settlements.length === 0 ? (
            <p className="px-1 py-4 text-sm" style={{ color: 'var(--text-soft)' }}>
              Nothing to settle this month.
            </p>
          ) : (
            <table className="ledger">
              <thead>
                <tr><th>Pays</th><th>Receives</th><th className="num">Amount</th></tr>
              </thead>
              <tbody>
                {report.settlements.map((s) => (
                  <tr key={`${s.from}-${s.to}`}>
                    <td className="font-medium">{s.from}</td>
                    <td className="font-medium">{s.to}</td>
                    <td className="num"><Money value={s.amount} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total settled</td>
                  <td className="num">
                    <Money value={report.settlements.reduce((t, s) => t + s.amount, 0)} />
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </Card>
      </div>

      <Card
        className="mt-4"
        title={`Charge detail · ${report.monthCharges.length} line(s)`}
        description="Every line behind the matrix, traceable to the movement that created it."
        bodyClassName="scroll-x"
      >
        <table className="ledger">
          <thead>
            <tr>
              <th>Date</th>
              <th>Owner</th>
              <th>Consumer</th>
              <th>Item</th>
              <th className="num">Qty</th>
              <th className="num">Unit rate</th>
              <th className="num">Amount</th>
              <th>Source PO</th>
              <th>Cost code</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {report.monthCharges.map((charge, index) => (
              <tr key={`${charge.reference}-${charge.owner}-${index}`}>
                <td>{shortDate(charge.date)}</td>
                <td>{charge.owner}</td>
                <td>{charge.consumer}</td>
                <td>{charge.itemCode}</td>
                <td className="num">{qty(charge.quantity)}</td>
                <td className="num"><Money value={charge.unitRate} decimals={4} /></td>
                <td className="num"><Money value={charge.amount} /></td>
                <td className="font-mono text-xs">{charge.sourcePo ?? '—'}</td>
                <td>{charge.costCode ?? '—'}</td>
                <td className="font-mono text-xs">
                  {charge.reference}
                  {charge.note && (
                    <div style={{ color: 'var(--text-soft)' }}>{charge.note}</div>
                  )}
                </td>
              </tr>
            ))}
            {report.monthCharges.length === 0 && (
              <tr><td colSpan={10} style={{ color: 'var(--text-soft)' }}>
                No charges fall in {monthLabel(settings.report_month)}.
              </td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>Total</td>
              <td className="num"><Money value={report.totals.monthConsumption} /></td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </Card>

      <div className="mt-4 grid gap-2 text-xs" style={{ color: 'var(--text-soft)' }}>
        <p>
          <strong>Method.</strong> {settings.valuation.replace(/_/g, ' ').toLowerCase()}
          {settings.honour_po_link ? ', source PO override on' : ', source PO override off'}
          {settings.backcharge_uplift > 0
            ? `, ${(settings.backcharge_uplift * 100).toFixed(2)}% uplift on interdepartment charges`
            : ', no uplift'}.
        </p>
        {settings.valuation === 'FIFO_MONTHLY' && (
          <p>
            <strong>FIFO caveat.</strong> Where a month draws from layers owned by more than one
            department, every consumer pays the same monthly rate and owner credits are split in
            proportion to the value drawn. The total is exact; an individual owner-to-consumer
            pair is pro-rata rather than transaction-exact.
          </p>
        )}
      </div>
    </>
  );
}
