'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const LINKS = [
  { href: '/',            label: 'Dashboard' },
  { href: '/stock',       label: 'Stock' },
  { href: '/purchases',   label: 'Purchases' },
  { href: '/movements',   label: 'Movements' },
  { href: '/backcharge',  label: 'Backcharge' },
  { href: '/statement',   label: 'Statements' },
  { href: '/dayworks',    label: 'Dayworks' },
  { href: '/masters',     label: 'Masters' },
  { href: '/import',      label: 'Import' },
  { href: '/settings',    label: 'Settings' },
];

export function Nav({
  storeName,
  reportMonth,
  userEmail,
  role,
  released,
}: {
  storeName: string;
  reportMonth: string;
  userEmail: string;
  role: string;
  released: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className="no-print sticky top-0 z-20 border-b"
            style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2.5">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-bold text-white"
            style={{ background: 'var(--color-flame-500)' }}
          >
            GC
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight">{storeName}</span>
            <span className="block text-[0.6875rem] leading-tight" style={{ color: 'var(--text-soft)' }}>
              {reportMonth}
            </span>
          </span>
        </Link>

        <nav className="ml-2 hidden flex-1 items-center gap-0.5 lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className="rounded-md px-2.5 py-1.5 text-[0.8125rem] font-medium"
              style={
                isActive(link.href)
                  ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                  : { color: 'var(--text-soft)' }
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <span
            className="hidden items-center rounded-md border px-2 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide sm:inline-flex"
            style={
              released
                ? { background: 'var(--ok-bg)', color: 'var(--ok-fg)', borderColor: 'var(--ok-line)' }
                : { background: 'var(--fail-bg)', color: 'var(--fail-fg)', borderColor: 'var(--fail-line)' }
            }
            title={released ? 'All controls pass' : 'A control is failing; release is blocked'}
          >
            {released ? 'Released' : 'Blocked'}
          </span>

          <details className="relative">
            <summary
              className="grid h-7 w-7 cursor-pointer list-none place-items-center rounded-full border text-[0.625rem] font-semibold"
              style={{ borderColor: 'var(--line)', color: 'var(--text-soft)' }}
              title={`${userEmail} — ${role}`}
            >
              {userEmail.slice(0, 2).toUpperCase()}
            </summary>
            <div className="card absolute right-0 mt-2 w-56 p-3 text-sm shadow-lg">
              <div className="truncate font-medium">{userEmail}</div>
              <div className="mt-0.5 text-xs capitalize" style={{ color: 'var(--text-soft)' }}>
                {role}
              </div>
              <form action="/auth/signout" method="post" className="mt-3">
                <button type="submit" className="btn w-full">Sign out</button>
              </form>
            </div>
          </details>

          <button
            type="button"
            className="btn px-2 lg:hidden"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            Menu
          </button>
        </div>
      </div>

      {open && (
        <nav className="grid gap-0.5 border-t px-4 py-2 lg:hidden" style={{ borderColor: 'var(--line)' }}>
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-2.5 py-2 text-sm font-medium"
              style={
                isActive(link.href)
                  ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                  : { color: 'var(--text-soft)' }
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
