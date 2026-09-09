import { canRecord, getLedger, getProfile, getReport } from '@/lib/data';
import { Badge, Card, DownloadLink, Money, Notice, PageHeader } from '@/components/ui';
import { qty, shortDate } from '@/lib/format';
import { todayIso } from '@/lib/engine/dates';
import { PurchaseForm } from './form';

export const dynamic = 'force-dynamic';

export default async function PurchasesPage() {
  const [report, ledger, profile] = await Promise.all([getReport(), getLedger(), getProfile()]);
  const { settings } = ledger;
  const layerByKey = new Map(report.layers.map((l) => [l.key, l]));
  const issuesFor = (id: string) => report.rowIssues.filter((i) => i.transactionId === id);

  const rows = [...ledger.purchases].reverse();

  return (
    <>
      <PageHeader
        title="Purchases"
        subtitle="One row per PO line. A fully received line becomes a cost layer that FIFO draws from."
        actions={<DownloadLink href="/api/export/purchases">Export</DownloadLink>}
      />

      {canRecord(profile) ? (
        <Card
          className="mb-4"
          title="Record a purchase"
          description={
            settings.purchase_includes_vat
              ? `Rates are entered gross; ${(settings.purchase_vat_rate * 100).toFixed(2)}% VAT is removed automatically.`
              : 'Rates are entered net of VAT.'
          }
        >
          <PurchaseForm
            departments={ledger.departments}
            items={ledger.items}
            suppliers={ledger.suppliers}
            defaultDepartment={settings.purchasing_department}
            today={todayIso()}
          />
        </Card>
      ) : (
        <div className="mb-4">
          <Notice>Your role is read-only. An administrator can grant recording rights from Settings.</Notice>
        </div>
      )}

      <Card title={`Register · ${ledger.purchases.length} row(s)`} bodyClassName="scroll-x">
        <table className="ledger">
          <thead>
            <tr>
              <th>ID</th>
              <th>PO</th>
              <th>Receipt</th>
              <th>Item</th>
              <th>Owner</th>
              <th className="num">Ordered</th>
              <th className="num">Received</th>
              <th className="num">Rate</th>
              <th className="num">Landed</th>
              <th className="num">Value</th>
              <th className="num">Remaining</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((purchase) => {
              const layer = layerByKey.get(`${purchase.po_no}/${purchase.po_line}`);
              const problems = issuesFor(purchase.transaction_id);
              return (
                <tr key={purchase.id}>
                  <td className="font-mono text-xs">{purchase.transaction_id}</td>
                  <td>
                    <span className="font-medium">{purchase.po_no}/{purchase.po_line}</span>
                    <div className="text-xs" style={{ color: 'var(--text-soft)' }}>
                      {shortDate(purchase.po_date)}{purchase.vendor_no ? ` · ${purchase.vendor_no}` : ''}
                    </div>
                  </td>
                  <td>{shortDate(purchase.receipt_date)}</td>
                  <td>{purchase.item_code}</td>
                  <td>{purchase.purchasing_department}</td>
                  <td className="num">{qty(purchase.qty_ordered)}</td>
                  <td className="num">{qty(purchase.qty_received)}</td>
                  <td className="num"><Money value={purchase.unit_refill_rate} /></td>
                  <td className="num">{layer ? <Money value={layer.landedRate} decimals={4} /> : '—'}</td>
                  <td className="num">{layer ? <Money value={layer.receivedValue} /> : '—'}</td>
                  <td className="num">{layer ? qty(layer.remaining) : '—'}</td>
                  <td>
                    {problems.length > 0 ? (
                      <span title={problems.map((p) => p.message).join('\n')}>
                        <Badge tone="fail">Check</Badge>
                      </span>
                    ) : purchase.qty_received >= purchase.qty_ordered ? (
                      <Badge tone="ok">Received</Badge>
                    ) : (
                      <Badge tone="warn">Open</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={12} style={{ color: 'var(--text-soft)' }}>No purchases recorded yet.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={9}>Total received value</td>
              <td className="num"><Money value={report.totals.receivedValue} /></td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </Card>

      {report.rowIssues.filter((i) => i.register === 'purchase').length > 0 && (
        <Card className="mt-4" title="Purchase exceptions" bodyClassName="scroll-x">
          <table className="ledger">
            <thead><tr><th>Transaction</th><th>Category</th><th>Problem</th></tr></thead>
            <tbody>
              {report.rowIssues.filter((i) => i.register === 'purchase').map((issue, index) => (
                <tr key={index}>
                  <td className="font-mono text-xs">{issue.transactionId}</td>
                  <td><Badge tone="warn">{issue.category}</Badge></td>
                  <td>{issue.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
