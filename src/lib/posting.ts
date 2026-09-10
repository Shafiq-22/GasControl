import type { Report } from './engine';
import { round } from './engine/money';

/** Posting totals are always recalculated on the server, never trusted from a form. */
export function postingFigures(report: Report) {
  if (!report.released) throw new Error('Posting blocked: resolve every failed dashboard control first.');
  return {
    line_count: report.dayworks.length,
    total_amount: round(report.dayworks.reduce((total, line) => total + line.amount, 0), report.ledger.settings.posting_decimals),
  };
}
