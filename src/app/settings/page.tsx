import { getLedger, getProfile, isAdmin } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { Card, Notice, PageHeader } from '@/components/ui';
import type { Profile } from '@/lib/types';
import { SettingsForm } from './form';
import { RoleRow } from './roles';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [ledger, profile] = await Promise.all([getLedger(), getProfile()]);
  const admin = isAdmin(profile);

  const supabase = await createClient();
  const { data: profiles } = await supabase.from('profiles').select('*').order('email');
  // Accounts waiting on approval are the actionable ones, so they come first.
  const people = ((profiles ?? []) as Profile[]).sort(
    (a, b) =>
      Number(b.role === 'pending') - Number(a.role === 'pending') ||
      a.email.localeCompare(b.email),
  );
  const awaiting = people.filter((p) => p.role === 'pending').length;

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Organisation, reporting month, valuation policy and entry rules. These drive every other page."
      />

      {!admin && (
        <div className="mb-4">
          <Notice>Settings are administrator-only. You can review them here.</Notice>
        </div>
      )}

      <SettingsForm
        settings={ledger.settings}
        departments={ledger.departments}
        editable={admin}
      />

      <Card
        className="mt-4"
        title="People and access"
        description={
          awaiting > 0
            ? `${awaiting} account(s) waiting for approval. A new signup can see nothing until you give it a role.`
            : 'Viewers read. Custodians record purchases and movements. Administrators also configure the store.'
        }
        bodyClassName="scroll-x"
      >
        <table className="ledger">
          <thead>
            <tr><th>Email</th><th>Name</th><th>Role</th>{admin && <th />}</tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <RoleRow
                key={person.id}
                person={person}
                editable={admin}
                isSelf={person.id === profile?.id}
              />
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mt-4" title="Month-end sequence" bodyClassName="p-4">
        <ol className="grid gap-2 text-sm" style={{ color: 'var(--text-soft)' }}>
          {[
            'Complete the purchase and movement registers. Reconcile supplier receipts and count the store and department cylinders.',
            'Set the reporting month, then resolve every register exception and every failing control on the dashboard.',
            'Review source PO links, rates, cost codes, own consumption and the pairwise settlement on the backcharge page.',
            'Print a statement for each department and obtain both departments’ sign-off.',
            'Export dayworks once, post it, and record the accounting reference here.',
            'Set the period lock date after archiving. Rows on or before it are flagged for review from then on.',
          ].map((step, index) => (
            <li key={index} className="flex gap-2.5">
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold"
                style={{ background: 'var(--canvas)', color: 'var(--text)' }}
              >
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
