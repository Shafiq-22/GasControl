import { describe, expect, it } from 'vitest';
import { readAllRows } from '@/lib/supabase/pagination';
import { safeReturnPath } from '@/lib/auth-redirect';
import { isOwnedImportPath } from '@/lib/import-upload';
import { buildLayers } from '@/lib/engine/layers';
import { buildReport } from '@/lib/engine';
import { postingFigures } from '@/lib/posting';
import { demoLedger } from './fixtures';

describe('production data controls', () => {
  it('loads a full 5000-row register even when the API caps a page at 200', async () => {
    const source = Array.from({ length: 5000 }, (_, id) => ({ id }));
    const result = await readAllRows('movements', async (from, to) => ({
      data: source.slice(from, Math.min(to + 1, from + 200)), error: null,
    }));
    expect(result).toEqual(source);
  });
  it('does not turn an inaccessible register into an empty ledger', async () => {
    await expect(readAllRows('purchases', async () => ({ data: null, error: { message: 'permission denied' } })))
      .rejects.toThrow('purchases');
  });
  it('does not accept external or executable login destinations', () => {
    for (const path of ['https://example.com', '//example.com', '/\\example.com', 'javascript:alert(1)']) {
      expect(safeReturnPath(path)).toBe('/');
    }
    expect(safeReturnPath('/stock?month=2026-09')).toBe('/stock?month=2026-09');
  });
  it('limits uploaded file references to the current user', () => {
    const user = '12345678-1234-1234-1234-123456789abc';
    expect(isOwnedImportPath(`${user}/abcdef12-1234-1234-1234-123456789abc.xlsx`, user)).toBe(true);
    for (const path of ['other/file.xlsx', `${user}/../file.xlsx`, 'https://example.com/file.xlsx']) {
      expect(isOwnedImportPath(path, user)).toBe(false);
    }
  });
  it('supports delivery allocation by refill value without losing charges', () => {
    const ledger = demoLedger();
    const base = ledger.purchases[0];
    const purchases = [
      { ...base, po_no: 'VALUE', po_line: 1, qty_received: 10, qty_ordered: 10, unit_refill_rate: 100, delivery_charge: 60, other_charges: 0 },
      { ...base, po_no: 'VALUE', po_line: 2, qty_received: 10, qty_ordered: 10, unit_refill_rate: 200, delivery_charge: 0, other_charges: 0 },
    ];
    const layers = buildLayers(purchases, { ...ledger.settings, delivery_allocation: 'PER_VALUE' }, new Map());
    expect(layers.map(l => l.landedRate)).toEqual([102, 204]);
    expect(layers.reduce((total, l) => total + l.receivedValue, 0)).toBe(3060);
  });
  it('blocks posting if an integrity control fails', () => {
    const report = buildReport(demoLedger());
    expect(() => postingFigures({ ...report, released: false })).toThrow('Posting blocked');
    const figures = postingFigures({ ...report, released: true });
    expect(figures.line_count).toBe(report.dayworks.length);
    expect(figures.total_amount).toBeCloseTo(report.dayworks.reduce((t, line) => t + line.amount, 0), 2);
  });
});
