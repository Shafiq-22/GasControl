import { safeReturnPath } from '@/lib/auth-redirect';
import { LoginForm } from './form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
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
        <LoginForm next={safeReturnPath(params.next)} initialError={params.error} />
      </div>
    </div>
  );
}
