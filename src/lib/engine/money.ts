import type { RoundingRule } from '@/lib/types';

/** Rounds to `decimals` under the configured rule. Sign-symmetric. */
export function round(value: number, decimals = 2, rule: RoundingRule = 'NEAREST'): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  const scaled = value * factor;
  const sign = scaled < 0 ? -1 : 1;
  const magnitude = Math.abs(scaled);
  let result: number;
  switch (rule) {
    case 'UP':
      result = Math.ceil(magnitude);
      break;
    case 'DOWN':
      result = Math.floor(magnitude);
      break;
    default:
      // Half-away-from-zero, nudged past binary representation error
      // (1.005 is stored as 1.00499…, which Math.round would take down).
      result = Math.round(magnitude + Number.EPSILON * magnitude);
  }
  return (sign * result) / factor;
}

/** True when two amounts agree within the configured reconciliation tolerance. */
export function within(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) < tolerance;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Splits `total` across `weights` so the parts add back to exactly `total`
 * at the given precision. The largest part absorbs the rounding remainder,
 * which keeps a department statement footing to the matrix total.
 */
export function apportion(total: number, weights: number[], decimals = 2): number[] {
  const weightTotal = sum(weights);
  if (weightTotal === 0 || weights.length === 0) return weights.map(() => 0);

  const parts = weights.map((w) => round((total * w) / weightTotal, decimals));
  const drift = round(total - sum(parts), decimals);
  if (drift !== 0) {
    let largest = 0;
    for (let i = 1; i < weights.length; i += 1) {
      if (Math.abs(weights[i]) > Math.abs(weights[largest])) largest = i;
    }
    parts[largest] = round(parts[largest] + drift, decimals);
  }
  return parts;
}
