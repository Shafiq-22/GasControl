'use client';

import { recordPosting } from '@/lib/actions';
import { ActionForm, Field, Submit } from '@/components/form';

export function PostingForm({
  reportMonth,
  lineCount,
  totalAmount,
  blocked,
}: {
  reportMonth: string;
  lineCount: number;
  totalAmount: number;
  blocked: boolean;
}) {
  return (
    <ActionForm action={recordPosting}>
      {(state) => (
        <>
          <input type="hidden" name="report_month" value={reportMonth} />
          <input type="hidden" name="line_count" value={lineCount} />
          <input type="hidden" name="total_amount" value={totalAmount.toFixed(4)} />

          <div className="grid gap-3">
            <Field label="Accounting reference" name="reference" error={state?.fieldErrors?.reference}
                   hint="The journal or batch number the export was posted under">
              <input id="reference" name="reference" className="field" required placeholder="JV-2026-09-118" />
            </Field>
            <Field label="Notes" name="notes">
              <input id="notes" name="notes" className="field" />
            </Field>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs" style={{ color: 'var(--text-soft)' }}>
              {blocked ? 'Controls are failing; posting is not recommended.' : `${lineCount} line(s).`}
            </p>
            <Submit>Record posting</Submit>
          </div>
        </>
      )}
    </ActionForm>
  );
}
