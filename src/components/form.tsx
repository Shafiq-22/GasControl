'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionResult } from '@/lib/actions';
import { Notice } from '@/components/ui';

export function Field({
  label,
  name,
  error,
  hint,
  children,
  className = '',
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>{label}</label>
      {children}
      {error && (
        <p className="mt-1 text-xs" style={{ color: 'var(--fail-fg)' }}>{error}</p>
      )}
      {!error && hint && (
        <p className="mt-1 text-xs" style={{ color: 'var(--text-soft)' }}>{hint}</p>
      )}
    </div>
  );
}

export function Submit({ children, className = 'btn btn-primary' }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? 'Saving…' : children}
    </button>
  );
}

/**
 * Wraps a server action so every form reports the same way: a banner for the
 * overall outcome, and per-field messages passed down through `state`.
 */
export function ActionForm({
  action,
  children,
  className = '',
  resetOnSuccess = false,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  children: (state: ActionResult | null) => React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form
      action={formAction}
      className={className}
      key={resetOnSuccess && state?.ok ? state.message : 'form'}
    >
      {state && (
        <div className="mb-3">
          <Notice tone={state.ok ? 'ok' : 'fail'}>{state.message}</Notice>
        </div>
      )}
      {children(state)}
    </form>
  );
}
