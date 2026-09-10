import { getSupabaseConfig } from '@/lib/supabase/config';
import SetupPage from './setup/page';
import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/nav';
import { AwaitingApproval } from './pending/screen';
import { getProfile, getReport } from '@/lib/data';
import { monthLabel } from '@/lib/engine/dates';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Gas Control',
  description: 'Shared gas store: purchases, cylinder movements and monthly department backcharges.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  if (!getSupabaseConfig()) return <html lang="en"><body><SetupPage /></body></html>;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  // The sign-in page renders bare; everything else sits inside the shell.
  if (!auth.user) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }

  const profile = await getProfile();

  // An unapproved account can read nothing, so show it why rather than letting
  // every page fail on a permission error.
  if (!profile || profile.role === 'pending') {
    return (
      <html lang="en">
        <body><AwaitingApproval email={auth.user.email ?? ''} /></body>
      </html>
    );
  }

  const report = await getReport().catch(() => null);

  return (
    <html lang="en">
      <body>
        <Nav
          storeName={report?.ledger.settings.store_name ?? 'Gas Control'}
          reportMonth={report ? monthLabel(report.ledger.settings.report_month) : ''}
          userEmail={auth.user.email ?? ''}
          role={profile?.role ?? 'viewer'}
          released={report?.released ?? false}
        />
        <main className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
