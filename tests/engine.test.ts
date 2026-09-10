import { describe, expect, it } from 'vitest';
import { buildReport, buildStatement } from '@/lib/engine';
import { apportion, round } from '@/lib/engine/money';
import { demoLedger } from './fixtures';

const report = buildReport(demoLedger());

const cell = (owner: string, consumer: string) =>
  round(report.matrix.cell.get(owner)!.get(consumer) ?? 0, 2);

const item = (code: string) => report.stock.find((s) => s.itemCode === code)!;

describe('cost layers', () => {
  it('lands each PO line at its own rate and owner', () => {
    const o2 = report.layers.filter((l) => l.itemCode === 'DEMO-O2');
    expect(o2.map((l) => [l.key, l.owner, l.landedRate])).toEqual([
      ['DEMO-PO1/1', 'BAF', 250],
      ['DEMO-PO2/1', 'BAA', 280],
      ['DEMO-PO3/1', 'BAF', 300],
    ]);
  });

  it('spreads delivery and other charges over the cylinders received', () => {
    const ledger = demoLedger();
    ledger.purchases = ledger.purchases.map((p) =>
      p.po_no === 'DEMO-PO4' ? { ...p, delivery_charge: 100, other_charges: 50 } : p,
    );
    const withCharges = buildReport(ledger);
    const layer = withCharges.layers.find((l) => l.key === 'DEMO-PO4/1')!;
    expect(layer.allocatedCharges).toBe(15); // 150 over 10 cylinders
    expect(layer.landedRate).toBe(265);
  });

  it('strips VAT from entered rates when purchases are entered gross', () => {
    const gross = buildReport(demoLedger({ purchase_includes_vat: true }));
    const layer = gross.layers.find((l) => l.key === 'DEMO-PO1/1')!;
    expect(round(layer.landedRate, 4)).toBe(round(250 / 1.05, 4));
  });
});

describe('monthly FIFO', () => {
  it('charges July consumption at the only layer open', () => {
    const july = report.months.find((m) => m.itemCode === 'DEMO-O2' && m.month === '2026-07')!;
    expect(july.rate).toBe(250);
    expect(july.drawnQty).toBe(5);
  });

  it('blends a month that spans two owners into one rate', () => {
    // August draws 5 left at 250 (BAF) and 5 at 280 (BAA) => 265 for everyone.
    const august = report.months.find((m) => m.itemCode === 'DEMO-O2' && m.month === '2026-08')!;
    expect(august.rate).toBe(265);
    expect(round(august.ownerShares.get('BAF')!, 6)).toBe(round(1250 / 2650, 6));
    expect(round(august.ownerShares.get('BAA')!, 6)).toBe(round(1400 / 2650, 6));
  });

  it('reserves a linked layer before unlinked demand draws', () => {
    // M-000007 names DEMO-PO3/1 and must pay that layer's 300, while the
    // unlinked September issue falls through to the 280 layer.
    const linked = report.charges.find((c) => c.reference === 'M-000007')!;
    expect(linked.unitRate).toBe(300);
    expect(linked.owner).toBe('BAF');

    const september = report.months.find((m) => m.itemCode === 'DEMO-O2' && m.month === '2026-09')!;
    expect(september.rate).toBe(280);
  });

  it('puts an unused return back on its source layer', () => {
    const mix = report.layers.find((l) => l.key === 'DEMO-PO8/1')!;
    expect(mix.remaining).toBe(8); // 10 received, 3 issued, 1 returned unused
    const credit = report.charges.find((c) => c.reference === 'M-000016')!;
    expect(credit.amount).toBe(-250);
  });
});

describe('transfers', () => {
  it('moves the charge between departments at the original rate', () => {
    const lines = report.charges.filter((c) => c.reference === 'M-000005' || c.note?.includes('Transferred'));
    const baf = lines.filter((l) => l.consumer === 'BAF');
    const wor = lines.filter((l) => l.consumer === 'WOR');
    // BAF was issued 4 at 280 and passed 2 to WOR.
    expect(round(baf.reduce((t, l) => t + l.amount, 0), 2)).toBe(560);
    expect(round(wor.reduce((t, l) => t + l.amount, 0), 2)).toBe(560);
    // Both sides keep the layer owner that actually paid for the gas.
    expect(new Set(lines.map((l) => l.owner))).toEqual(new Set(['BAA']));
  });

  it('leaves total consumption unchanged', () => {
    const transferLines = report.charges.filter((c) => c.note?.includes('Transferred'));
    expect(round(transferLines.reduce((t, l) => t + l.amount, 0), 2)).toBe(0);
  });
});

describe('backcharge matrix', () => {
  it('places every September charge in the right cell', () => {
    expect(cell('BAF', 'BAF')).toBe(1000);  // own use: acetylene 500 + nitrogen 500
    expect(cell('BAF', 'WOR')).toBe(4250);  // acetylene 1250 + CO2 2500 + mix 500
    expect(cell('BAF', 'BAA')).toBe(1350);  // acetylene 750 + oxygen 600
    expect(cell('BAA', 'BAF')).toBe(560);
    expect(cell('BAA', 'WOR')).toBe(560);
    expect(cell('WOR', 'BAF')).toBe(0);
  });

  it('nets to zero across departments', () => {
    const net = [...report.matrix.netReceivable.values()].reduce((t, v) => t + v, 0);
    expect(round(net, 6)).toBe(0);
  });

  it('settles each pair with a single payment', () => {
    expect(report.settlements).toEqual(
      expect.arrayContaining([
        { from: 'WOR', to: 'BAF', amount: 4250 },
        { from: 'BAA', to: 'BAF', amount: 790 },
        { from: 'WOR', to: 'BAA', amount: 560 },
      ]),
    );
    expect(report.settlements).toHaveLength(3);
  });

  it('keeps own consumption off the settlement', () => {
    const ownPaid = report.settlements.filter((s) => s.from === s.to);
    expect(ownPaid).toHaveLength(0);
    expect(report.totals.ownConsumption).toBe(1000);
  });
});

describe('stock position', () => {
  it('accounts for every cylinder received', () => {
    for (const row of report.stock) {
      expect(row.cylinderBalance, `${row.itemCode} cylinders`).toBe(0);
      expect(row.layerBalance, `${row.itemCode} layers`).toBe(0);
    }
  });

  it('tracks oxygen across store, departments, empties and write-offs', () => {
    const o2 = item('DEMO-O2');
    expect(o2.fullInStore).toBe(9);
    expect(o2.out.get('WOR')).toBe(13);
    expect(o2.out.get('BAF')).toBe(2);
    expect(o2.out.get('BAA')).toBe(2);
    expect(o2.emptiesInStore).toBe(1);
    expect(o2.returnedToSupplier).toBe(2);
    expect(o2.lostShells).toBe(1);
    expect(o2.stockValue).toBe(2680); // 1 at 280 + 8 at 300
  });

  it('reconciles purchase value against stock held plus gas charged out', () => {
    expect(report.totals.receivedValue).toBe(26100);
    expect(report.totals.stockValue).toBe(14480);
    const allCharges = round(report.charges.reduce((t, c) => t + c.amount, 0), 2);
    expect(round(report.totals.stockValue + allCharges, 2)).toBe(report.totals.receivedValue);
  });

  it('flags an item at or below its reorder point', () => {
    expect(item('DEMO-AC').fullInStore).toBe(0);
    expect(item('DEMO-AC').belowReorder).toBe(true);
    expect(item('DEMO-AR').belowReorder).toBe(false);
  });
});

describe('release controls', () => {
  it('passes every control on clean demonstration data', () => {
    const failing = report.controls.filter((c) => !c.pass);
    expect(failing.map((c) => `${c.label}: ${c.measure}`)).toEqual([]);
    expect(report.released).toBe(true);
    expect(report.controls).toHaveLength(14);
  });

  it('finds no row errors in either register', () => {
    expect(report.rowIssues).toEqual([]);
    expect(report.valuationIssues).toEqual([]);
  });

  it('fails the gate when a cost code belongs to another department', () => {
    const ledger = demoLedger();
    ledger.movements = ledger.movements.map((m) =>
      m.transaction_id === 'M-000009' ? { ...m, cost_code: 'DEMO-BAF' } : m,
    );
    const broken = buildReport(ledger);
    expect(broken.released).toBe(false);
    expect(broken.rowIssues.some((i) => i.message.includes('belongs to BAF'))).toBe(true);
  });

  it('fails the gate when an issue has no layer to draw from', () => {
    const ledger = demoLedger();
    ledger.purchases = ledger.purchases.filter((p) => p.po_no !== 'DEMO-PO4');
    const broken = buildReport(ledger);
    expect(broken.released).toBe(false);
    expect(broken.valuationIssues.some((i) => i.message.includes('no purchase layer'))).toBe(true);
  });

  it('fails the gate while the organisation is unconfigured', () => {
    const unconfigured = buildReport(demoLedger({ company_name: 'CONFIGURE COMPANY' }));
    expect(unconfigured.controls.find((c) => c.id === 'config')!.pass).toBe(false);
  });

  it('flags movements inside a locked period', () => {
    const locked = buildReport(demoLedger({ lock_date: '2026-09-30' }));
    expect(locked.controls.find((c) => c.id === 'period')!.pass).toBe(false);
  });
});

describe('department statement', () => {
  it('agrees with the department column of the matrix', () => {
    for (const dept of ['BAF', 'WOR', 'BAA']) {
      const statement = buildStatement(report, dept);
      expect(statement.totalAmount, dept).toBe(round(report.matrix.columnTotal.get(dept)!, 2));
    }
  });

  it('separates own consumption from what is payable to other departments', () => {
    const baf = buildStatement(report, 'BAF');
    expect(baf.ownConsumption).toBe(1000);
    expect(baf.payableToOthers).toBe(560);
    expect(baf.receivableFromOthers).toBe(5600);
    expect(baf.netReceivable).toBe(5040);
  });
});

describe('dayworks export', () => {
  it('posts only cross-department lines', () => {
    expect(report.dayworks.every((line) => line.fromCostCentre !== line.toCostCentre)).toBe(true);
    const posted = round(report.dayworks.reduce((t, l) => t + l.amount, 0), 2);
    expect(posted).toBe(report.totals.interdepartment);
    expect(posted).toBe(round(report.totals.monthConsumption - report.totals.ownConsumption, 2));
  });

  it('carries the cost centres rather than the department codes', () => {
    const line = report.dayworks.find((l) => l.reference === 'M-000007')!;
    expect(line.fromCostCentre).toBe('CC-BAF');
    expect(line.toCostCentre).toBe('CC-BAA');
  });

  it('applies the backcharge VAT rate', () => {
    const withVat = buildReport(demoLedger({ backcharge_vat_rate: 0.05 }));
    const line = withVat.dayworks[0];
    expect(line.vat).toBe(round(line.amount * 0.05, 2));
  });
});

describe('settings change the answer', () => {
  it('uplifts interdepartment charges but never own use', () => {
    const uplifted = buildReport(demoLedger({ backcharge_uplift: 0.1 }));
    expect(uplifted.matrix.cell.get('BAF')!.get('WOR')).toBe(round(4250 * 1.1, 2));
    expect(uplifted.matrix.cell.get('BAF')!.get('BAF')).toBe(1000);
    expect(uplifted.controls.find((c) => c.id === 'value')!.pass).toBe(true);
  });

  it('ignores the source PO link when the policy is off', () => {
    const unlinked = buildReport(demoLedger({ honour_po_link: false }));
    // Everything in September now shares one blended rate.
    const rates = new Set(
      unlinked.charges.filter((c) => c.itemCode === 'DEMO-O2' && c.month === '2026-09').map((c) => c.unitRate),
    );
    expect(rates.size).toBe(1);
  });

  it('values at the standard rate under STD', () => {
    const std = buildReport(demoLedger({ valuation: 'STD' }));
    const acetylene = std.charges.filter((c) => c.itemCode === 'DEMO-AC');
    expect(new Set(acetylene.map((c) => c.unitRate))).toEqual(new Set([250]));
  });

  it('defers the charge to the empty return under ON_RETURN', () => {
    const onReturn = buildReport(demoLedger({ trigger_rule: 'ON_RETURN' }));
    // Only 6 of the 10 CO2 cylinders came back, so only those are charged.
    const co2 = onReturn.charges.filter((c) => c.itemCode === 'DEMO-CO2');
    expect(round(co2.reduce((t, c) => t + c.quantity, 0), 2)).toBe(6);
    // The lost oxygen shell is charged here instead of at issue.
    expect(onReturn.charges.some((c) => c.reference === 'M-000008')).toBe(true);
  });
});

describe('rounding', () => {
  it('splits an amount so the parts add back exactly', () => {
    const parts = apportion(100, [1 / 3, 1 / 3, 1 / 3], 2);
    expect(parts.reduce((t, p) => t + p, 0)).toBe(100);
  });

  it('rounds half away from zero', () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(-1.005, 2)).toBe(-1.01);
    expect(round(2.675, 2)).toBe(2.68);
  });
});
