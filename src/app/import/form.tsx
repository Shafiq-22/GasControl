'use client';

import { createClient } from '@/lib/supabase/client';
import { IMPORT_BUCKET, MAX_IMPORT_BYTES, DIRECT_UPLOAD_BYTES } from '@/lib/import-upload';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Card, Notice } from '@/components/ui';
import type { ImportSummary } from '@/app/api/import/route';

interface Outcome {
  dryRun: boolean;
  summaries: ImportSummary[];
  warnings: string[];
}

export function ImportForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [fileName, setFileName] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setOutcome(null);

    const form = new FormData(event.currentTarget);
    const file = form.get('file');
    let uploadedPath: string | null = null;
    try {
      if (!(file instanceof File)) throw new Error('Choose a workbook.');
      if (file.size > MAX_IMPORT_BYTES) throw new Error('The workbook must be 25 MB or smaller.');
      let response: Response;
      if (file.size > DIRECT_UPLOAD_BYTES) {
        const supabase = createClient();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) throw new Error('Your session expired. Sign in again.');
        uploadedPath = `${auth.user.id}/${crypto.randomUUID()}.xlsx`;
        const { error: uploadError } = await supabase.storage.from(IMPORT_BUCKET).upload(uploadedPath, file, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false,
        });
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}. Ask the administrator to check the import storage setup.`);
        response = await fetch('/api/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath: uploadedPath, dryRun: form.get('dry_run') === 'on' }),
        });
      } else {
        response = await fetch('/api/import', { method: 'POST', body: form });
      }
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error(`The server could not finish the import (${response.status}). Retry or ask the administrator to check the deployment logs.`);
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'The import failed.');
      setOutcome(body as Outcome);
      if (!body.dryRun) router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The upload failed. Please retry.');
    } finally {
      if (uploadedPath) {
        try { await createClient().storage.from(IMPORT_BUCKET).remove([uploadedPath]); } catch { /* The server also removes completed uploads. */ }
      }
      setBusy(false);
    }
  }

  const totalWritten = outcome?.summaries.reduce((t, s) => t + s.written, 0) ?? 0;
  const totalSkipped = outcome?.summaries.reduce((t, s) => t + s.skipped.length, 0) ?? 0;

  return (
    <>
      <Card title="Upload a workbook">
        <form onSubmit={submit} className="grid gap-3">
          <div>
            <label className="label" htmlFor="file">Workbook (.xlsx)</label>
            <input
              id="file"
              name="file"
              type="file"
              accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              className="field"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
            />
          </div>

          <label className="flex items-start gap-2.5 rounded-lg border p-3"
                 style={{ borderColor: 'var(--line)' }}>
            <input type="checkbox" name="dry_run" defaultChecked className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Check the file without writing</span>
              <span className="block text-xs" style={{ color: 'var(--text-soft)' }}>
                Reports what would be imported and what would be skipped. Clear this to write for real.
              </span>
            </span>
          </label>

          {error && <Notice tone="fail">{error}</Notice>}

          <div className="flex items-center gap-3">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Reading…' : 'Import'}
            </button>
            {fileName && (
              <span className="text-xs" style={{ color: 'var(--text-soft)' }}>{fileName}</span>
            )}
          </div>
        </form>
      </Card>

      {outcome && (
        <Card
          className="mt-4"
          title={outcome.dryRun ? 'Check complete — nothing was written' : 'Import complete'}
          description={
            outcome.dryRun
              ? `${totalWritten} row(s) would be imported, ${totalSkipped} skipped.`
              : `${totalWritten} row(s) imported, ${totalSkipped} skipped.`
          }
          bodyClassName="p-0"
        >
          <div className="scroll-x p-4">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Table</th>
                  <th className="num">Rows read</th>
                  <th className="num">{outcome.dryRun ? 'Would import' : 'Imported'}</th>
                  <th className="num">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {outcome.summaries.map((summary) => (
                  <tr key={summary.table}>
                    <td className="font-medium">{summary.table.replace(/_/g, ' ')}</td>
                    <td className="num">{summary.read}</td>
                    <td className="num">{summary.written}</td>
                    <td className="num">{summary.skipped.length || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {outcome.warnings.length > 0 && (
            <div className="border-t p-4" style={{ borderColor: 'var(--line)' }}>
              <h3 className="mb-2 text-sm font-medium">Warnings</h3>
              <ul className="grid gap-1 text-xs" style={{ color: 'var(--text-soft)' }}>
                {outcome.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
              </ul>
            </div>
          )}

          {totalSkipped > 0 && (
            <div className="scroll-x border-t p-4" style={{ borderColor: 'var(--line)' }}>
              <h3 className="mb-2 text-sm font-medium">Skipped rows</h3>
              <table className="ledger">
                <thead>
                  <tr><th>Table</th><th className="num">Row</th><th>Reason</th></tr>
                </thead>
                <tbody>
                  {outcome.summaries.flatMap((summary) =>
                    summary.skipped.map((skip, index) => (
                      <tr key={`${summary.table}-${index}`}>
                        <td>{summary.table.replace(/_/g, ' ')}</td>
                        <td className="num">{skip.row || '—'}</td>
                        <td><Badge tone="warn">{skip.reason}</Badge></td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
