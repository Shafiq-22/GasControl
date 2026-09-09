/** Date helpers. Everything is handled as an ISO yyyy-mm-dd string in UTC. */

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthLabel(iso: string): string {
  const [year, month] = iso.slice(0, 7).split('-').map(Number);
  const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-GB', {
    month: 'short',
    timeZone: 'UTC',
  });
  return `${name} ${year}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/** Ascending list of yyyy-mm keys covering both endpoints. */
export function monthRange(firstIso: string, lastIso: string): string[] {
  const keys: string[] = [];
  let [year, month] = firstIso.slice(0, 7).split('-').map(Number);
  const [lastYear, lastMonth] = lastIso.slice(0, 7).split('-').map(Number);
  // Guard against a bad range producing an unbounded loop.
  for (let guard = 0; guard < 1200; guard += 1) {
    if (year > lastYear || (year === lastYear && month > lastMonth)) break;
    keys.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
