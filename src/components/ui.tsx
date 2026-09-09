import type { ReactNode } from 'react';

export function Card({
  title,
  description,
  actions,
  children,
  className = '',
  bodyClassName = 'p-4',
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3"
                style={{ borderColor: 'var(--line)' }}>
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-soft)' }}>{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm" style={{ color: 'var(--text-soft)' }}>{subtitle}</p>
        )}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type Tone = 'ok' | 'fail' | 'warn' | 'neutral';

const TONE: Record<Tone, { bg: string; fg: string; line: string }> = {
  ok:      { bg: 'var(--ok-bg)',   fg: 'var(--ok-fg)',   line: 'var(--ok-line)' },
  fail:    { bg: 'var(--fail-bg)', fg: 'var(--fail-fg)', line: 'var(--fail-line)' },
  warn:    { bg: 'var(--warn-bg)', fg: 'var(--warn-fg)', line: 'var(--warn-line)' },
  neutral: { bg: 'var(--canvas)',  fg: 'var(--text-soft)', line: 'var(--line)' },
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const c = TONE[tone];
  return (
    <span
      className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide"
      style={{ background: c.bg, color: c.fg, borderColor: c.line }}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="card p-4">
      <div className="text-[0.6875rem] font-semibold uppercase tracking-wide"
           style={{ color: 'var(--text-soft)' }}>
        {label}
      </div>
      <div className="num mt-1.5 text-2xl font-semibold tracking-tight"
           style={{ textAlign: 'left', color: tone === 'fail' ? 'var(--fail-fg)' : 'var(--text)' }}>
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-xs" style={{ color: 'var(--text-soft)' }}>{hint}</div>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="px-1 py-6 text-center text-sm" style={{ color: 'var(--text-soft)' }}>
      {children}
    </p>
  );
}

export function Notice({ tone = 'warn', children }: { tone?: Tone; children: ReactNode }) {
  const c = TONE[tone];
  return (
    <div className="rounded-lg border px-3 py-2 text-sm"
         style={{ background: c.bg, color: c.fg, borderColor: c.line }}>
      {children}
    </div>
  );
}

export function Money({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const text = Math.abs(value).toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <span style={value < 0 ? { color: 'var(--fail-fg)' } : undefined}>
      {value < 0 ? `(${text})` : text}
    </span>
  );
}

/**
 * A download link. These point at API routes that stream a file, so they must
 * be a real navigation rather than a client-side route change.
 */
export function DownloadLink({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <a className={primary ? 'btn btn-primary' : 'btn'} href={href} download>
      {children}
    </a>
  );
}
