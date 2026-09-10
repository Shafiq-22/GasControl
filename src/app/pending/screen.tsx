import { Card } from '@/components/ui';

/**
 * What a new account sees until an administrator approves it.
 *
 * A signup on its own grants nothing — every read policy requires an approved
 * role — so this is the honest thing to show rather than a page of failures.
 */
export function AwaitingApproval({ email }: { email: string }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="mb-6 flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid h-9 w-9 place-items-center rounded-lg text-sm font-bold text-white"
          style={{ background: 'var(--color-flame-500)' }}
        >
          GC
        </span>
        <div>
          <h1 className="text-base font-semibold leading-tight">Gas Control</h1>
          <p className="text-xs leading-tight" style={{ color: 'var(--text-soft)' }}>
            Shared gas store
          </p>
        </div>
      </div>

      <Card title="Your account is waiting for approval">
        <p className="text-sm">
          <strong>{email}</strong> has been registered, but an administrator has
          not yet granted it access to the store.
        </p>
        <p className="mt-3 text-sm" style={{ color: 'var(--text-soft)' }}>
          Ask the store custodian to open Settings and give this address a role.
          Until then no purchase, movement or cost information is visible.
        </p>
        <form action="/auth/signout" method="post" className="mt-5">
          <button type="submit" className="btn">Sign out</button>
        </form>
      </Card>
    </main>
  );
}
