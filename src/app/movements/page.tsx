import { canRecord, getLedger, getProfile, getReport } from '@/lib/data';
import { Badge, Card, DownloadLink, Money, Notice, PageHeader } from '@/components/ui';
import { qty, shortDate, titleCase } from '@/lib/format';
import { todayIso } from '@/lib/engine/dates';
import { MovementForm } from './form';

export const dynamic = 'force-dynamic';

const KIND_TONE = {
  ISSUE: 'neutral',
  RETURN_EMPTY: 'neutral',
  RETURN_UNUSED: 'warn',
  TRANSFER: 'warn',
  TO_SUPPLIER: 'neutral',
  ADJUSTMENT: 'fail',
} as const;

export default async function MovementsPage() {
  const [report, ledger, profile] = await Promise.all([getReport(), getLedger(), getProfile()]);
  const { settings } = ledger;

  const chargeByReference = new Map<string, number>();
  for (const charge of report.charges) {
    chargeByReference.set(charge.reference, (chargeByReference.get(charge.reference) ?? 0) + charge.amount);
  }

  const issueOptions = ledger.movements
    .filter((m) => m.kind === 'ISSUE')
    .reverse()
    .slice(0, 200)
    .map((m) => ({
      id: m.transaction_id,
      label: `${m.transaction_id} · ${shortDate(m.moved_on)} · ${m.item_code} × ${m.quantity} → ${m.to_code}`,
      itemCode: m.item_code,
      department: m.to_code,
    }));

  const rows = [...ledger.movements].reverse();
  const issuesFor = (id: string) => report.rowIssues.filter((i) => i.transactionId === id);

  return (
    <>
      <PageHeader
        title="Movements"
        subtitle="Issues, returns, transfers, supplier collections and adjustments. Append-only."
        actions={<DownloadLink href="/api/export/movements">Export</DownloadLink>}
      />

      {canRecord(profile) ? (
        <Card className="mb-4" title="Record a movement">
          <MovementForm
            settings={settings}
            departments={ledger.departments}
            items={ledger.items}
            costCodes={ledger.costCodes}
            personnel={ledger.personnel}
            layerKeys={report.layers.map((l) => ({ key: l.key, itemCode: l.itemCode, remaining: l.remaining }))}
            issueOptions={issueOptions}
            today={todayIso()}
          />
        </Card>
      ) : (
        <div className="mb-4">
          <Notice>Your role is read-only. An administrator can grant recording rights from Settings.</Notice>
        </div>
      )}

      <Card title={`Register · ${ledger.movements.length} row(s)`} bodyClassName="scroll-x">
        <table className="ledger">
          <thead>
            <tr>
              <th>ID</th>
              <th>Date</th>
              <th>Type</th>
              <th>Item</th>
              <th className="num">Qty</th>
              <th>Route</th>
              <th>Receiver</th>
              <th>Cost code</th>
              <th>Source PO</th>
              <th className="num">Charged</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((movement) => {
              const problems = issuesFor(movement.transaction_id);
              const charged = chargeByReference.get(movement.transaction_id);
              return (
                <tr key={movement.id}>
                  <td className="font-mono text-xs">{movement.transaction_id}</td>
                  <td>{shortDate(movement.moved_on)}</td>
                  <td><Badge tone={KIND_TONE[movement.kind]}>{titleCase(movement.kind)}</Badge></td>
                  <td>{movement.item_code}</td>
                  <td className="num">{qty(movement.quantity)}</td>
                  <td className="whitespace-nowrap">
                    {movement.from_code} <span style={{ color: 'var(--text-soft)' }}>→</span> {movement.to_code}
                  </td>
                  <td>{movement.receiver_name ?? '—'}</td>
                  <td>{movement.cost_code ?? '—'}</td>
                  <td className="font-mono text-xs">{movement.source_po_line ?? '—'}</td>
                  <td className="num">{charged === undefined ? '—' : <Money value={charged} />}</td>
                  <td>
                    {problems.length > 0 ? (
                      <span title={problems.map((p) => p.message).join('\n')}>
                        <Badge tone="fail">Check</Badge>
                      </span>
                    ) : (
                      <Badge tone="ok">OK</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={11} style={{ color: 'var(--text-soft)' }}>No movements recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {report.rowIssues.filter((i) => i.register === 'movement').length > 0 && (
        <Card className="mt-4" title="Movement exceptions" bodyClassName="scroll-x">
          <table className="ledger">
            <thead><tr><th>Transaction</th><th>Category</th><th>Problem</th></tr></thead>
            <tbody>
              {report.rowIssues.filter((i) => i.register === 'movement').map((issue, index) => (
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
