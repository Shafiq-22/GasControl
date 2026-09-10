import { getReport } from '@/lib/data';
import { Badge, Card, DownloadLink, Money, PageHeader } from '@/components/ui';
import { qty } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function StockPage() {
  const report = await getReport();
  const { settings } = report.ledger;
  const departments = report.departmentSummary.map((d) => d.code);
  const owners = departments;

  const total = <T,>(pick: (row: (typeof report.stock)[number]) => number) =>
    report.stock.reduce((sum, row) => sum + pick(row), 0);

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle={`Quantities in ${settings.stock_unit}, value in ${settings.currency_code}. Value is what is left in the cost layers.`}
        actions={<DownloadLink href="/api/export/stock">Export</DownloadLink>}
      />

      <Card bodyClassName="scroll-x" title="Position by item">
        <table className="ledger">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Full in store</th>
              {departments.map((code) => (
                <th key={code} className="num">Out {code}</th>
              ))}
              <th className="num">Empties in store</th>
              <th className="num">At supplier</th>
              <th className="num">Lost</th>
              <th className="num">On site</th>
              <th className="num">Stock value</th>
              <th className="num">Days cover</th>
              <th>Alert</th>
            </tr>
          </thead>
          <tbody>
            {report.stock.map((row) => (
              <tr key={row.itemCode}>
                <td>
                  <span className="font-medium">{row.itemCode}</span>
                  <div className="text-xs" style={{ color: 'var(--text-soft)' }}>{row.description}</div>
                </td>
                <td className="num">{qty(row.fullInStore)}</td>
                {departments.map((code) => (
                  <td key={code} className="num">{qty(row.out.get(code) ?? 0)}</td>
                ))}
                <td className="num">{qty(row.emptiesInStore)}</td>
                <td className="num">{qty(row.returnedToSupplier)}</td>
                <td className="num">{qty(row.lostShells)}</td>
                <td className="num">{qty(row.totalOnSite)}</td>
                <td className="num"><Money value={row.stockValue} /></td>
                <td className="num">{row.daysCover === null ? '—' : Math.floor(row.daysCover)}</td>
                <td>
                  {row.belowMinimum ? (
                    <Badge tone="fail">Below minimum</Badge>
                  ) : row.belowReorder ? (
                    <Badge tone="warn">Reorder</Badge>
                  ) : (
                    <Badge tone="ok">OK</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="num">{qty(total((r) => r.fullInStore))}</td>
              {departments.map((code) => (
                <td key={code} className="num">{qty(total((r) => r.out.get(code) ?? 0))}</td>
              ))}
              <td className="num">{qty(total((r) => r.emptiesInStore))}</td>
              <td className="num">{qty(total((r) => r.returnedToSupplier))}</td>
              <td className="num">{qty(total((r) => r.lostShells))}</td>
              <td className="num">{qty(total((r) => r.totalOnSite))}</td>
              <td className="num"><Money value={report.totals.stockValue} /></td>
              <td /><td />
            </tr>
          </tfoot>
        </table>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card
          title="Stock value by owner"
          description="Which department's money is still sitting on the rack."
          bodyClassName="scroll-x"
        >
          <table className="ledger">
            <thead>
              <tr>
                <th>Item</th>
                {owners.map((owner) => (
                  <th key={owner} className="num">{owner}</th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {report.stock
                .filter((row) => row.stockValue !== 0)
                .map((row) => (
                  <tr key={row.itemCode}>
                    <td className="font-medium">{row.itemCode}</td>
                    {owners.map((owner) => (
                      <td key={owner} className="num">
                        <Money value={row.ownerStock.get(owner) ?? 0} />
                      </td>
                    ))}
                    <td className="num"><Money value={row.stockValue} /></td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                {owners.map((owner) => (
                  <td key={owner} className="num">
                    <Money value={total((r) => r.ownerStock.get(owner) ?? 0)} />
                  </td>
                ))}
                <td className="num"><Money value={report.totals.stockValue} /></td>
              </tr>
            </tfoot>
          </table>
        </Card>

        <Card
          title="Open cost layers"
          description="FIFO draws from the top of this list. Quote a key as the Source PO Line to reserve a layer."
          bodyClassName="scroll-x"
        >
          <table className="ledger">
            <thead>
              <tr>
                <th>Layer</th>
                <th>Item</th>
                <th>Owner</th>
                <th className="num">Landed rate</th>
                <th className="num">Received</th>
                <th className="num">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {report.layers.filter((l) => l.remaining > 0).map((layer) => (
                <tr key={layer.key}>
                  <td className="font-mono text-xs">{layer.key}</td>
                  <td>{layer.itemCode}</td>
                  <td>{layer.owner}</td>
                  <td className="num"><Money value={layer.landedRate} /></td>
                  <td className="num">{qty(layer.quantity)}</td>
                  <td className="num">{qty(layer.remaining)}</td>
                </tr>
              ))}
              {report.layers.every((l) => l.remaining <= 0) && (
                <tr><td colSpan={6} style={{ color: 'var(--text-soft)' }}>Every layer is fully drawn.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {settings.empty_state_policy === 'ASSUME_ALL_OUT' && (
        <p className="mt-4 text-xs" style={{ color: 'var(--text-soft)' }}>
          There is no consumption-status scan, so every cylinder held by a department
          counts as an assumed empty ({qty(total((r) => r.assumedEmptiesOut))} {settings.stock_unit}).
          That is an estimate of state within the cylinders already shown as out, not extra stock.
        </p>
      )}
    </>
  );
}
