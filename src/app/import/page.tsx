import { getProfile, isAdmin } from '@/lib/data';
import { Card, DownloadLink, Notice, PageHeader } from '@/components/ui';
import { ImportForm } from './form';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const profile = await getProfile();

  return (
    <>
      <PageHeader
        title="Import from Excel"
        subtitle="Load the gas control workbook, or any sheet exported from here, into the database."
        actions={<DownloadLink href="/api/export/workbook">Download full workbook</DownloadLink>}
      />

      {isAdmin(profile) ? (
        <ImportForm />
      ) : (
        <Notice>Importing is administrator-only.</Notice>
      )}

      <Card className="mt-4" title="What gets read">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <h3 className="font-medium">Sheets</h3>
            <p className="mt-1" style={{ color: 'var(--text-soft)' }}>
              <code>03_MASTERS</code>, <code>04_PURCHASES</code> and <code>05_MOVEMENTS</code> from the
              original workbook, or the <code>Departments</code>, <code>Gas items</code>,{' '}
              <code>Suppliers</code>, <code>Cost codes</code>, <code>Personnel</code>,{' '}
              <code>Purchases</code> and <code>Movements</code> sheets this app exports. Sheets are
              matched by name and columns by their heading, so a renamed copy still works.
            </p>
          </div>
          <div>
            <h3 className="font-medium">How rows are treated</h3>
            <p className="mt-1" style={{ color: 'var(--text-soft)' }}>
              Master rows are matched on their code and updated in place. Purchases and movements
              are append-only: a transaction id already in the register is left exactly as it is,
              so re-importing the same file changes nothing. Rows that cannot be read are listed
              back with the reason rather than being guessed at.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}
