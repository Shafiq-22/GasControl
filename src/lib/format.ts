/** Presentation helpers. The engine returns numbers; these make them read. */

export function money(value: number, currency = 'AED', decimals = 2): string {
  const text = Math.abs(value).toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return value < 0 ? `(${text})` : text;
}

export function withCurrency(value: number, currency = 'AED', decimals = 2): string {
  return `${currency} ${money(value, currency, decimals)}`;
}

export function qty(value: number): string {
  if (value === 0) return '—';
  return value.toLocaleString('en-GB', { maximumFractionDigits: 3 });
}

export function rate(value: number): string {
  return value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  const name = new Date(Date.UTC(year, month - 1, day)).toLocaleString('en-GB', {
    month: 'short',
    timeZone: 'UTC',
  });
  return `${String(day).padStart(2, '0')} ${name} ${year}`;
}

export function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
}
