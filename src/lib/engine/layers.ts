import type { Ledger, Purchase, Settings } from '@/lib/types';
import { sum } from './money';

/**
 * A cost layer is one fully received PO line. FIFO draws against it in
 * receipt order, and its purchasing department is the owner credited when
 * another department consumes from it.
 */
export interface CostLayer {
  key: string;              // 'PO1/1' — the value users type into Source PO Line
  transactionId: string;
  itemCode: string;
  owner: string;            // purchasing department
  receiptDate: string;
  netRefillRate: number;    // ex-VAT refill rate per cylinder
  allocatedCharges: number; // delivery + other, per cylinder
  landedRate: number;       // what a cylinder from this layer costs
  quantity: number;         // as received
  remaining: number;        // mutated as FIFO and linked draws consume it
  receivedValue: number;
  /** STD valuation only: (landed - standard) x qty, reported on the stock page. */
  priceVariance: number;
}

export function layerKey(poNo: string, poLine: number | string): string {
  return `${poNo}/${poLine}`;
}

/** Normalises what a user typed into a Source PO Line so 'po1 / 1' matches 'PO1/1'. */
export function normaliseLayerKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Turns received purchase rows into cost layers.
 *
 * Delivery and other charges are entered once per PO and spread over its
 * lines: PER_CYLINDER weights by cylinders received, PER_LINE splits evenly
 * between lines. Both give the same answer for a single-line PO.
 */
export function buildLayers(purchases: Purchase[], settings: Settings, standardRates: Map<string, number>): CostLayer[] {
  const received = purchases.filter((p) => p.qty_received > 0);
  const vatDivisor = settings.purchase_includes_vat ? 1 + settings.purchase_vat_rate : 1;

  // PO-wide charge pools, so an amount entered once on line 1 reaches every line.
  const poCharges = new Map<string, { charges: number; qty: number; lines: number }>();
  for (const p of received) {
    const pool = poCharges.get(p.po_no) ?? { charges: 0, qty: 0, lines: 0 };
    pool.charges += (p.delivery_charge + p.other_charges) / vatDivisor;
    pool.qty += p.qty_received;
    pool.lines += 1;
    poCharges.set(p.po_no, pool);
  }

  const layers = received.map((p): CostLayer => {
    const pool = poCharges.get(p.po_no)!;
    const lineShare =
      settings.delivery_allocation === 'PER_LINE'
        ? pool.charges / pool.lines
        : pool.qty > 0
          ? (pool.charges * p.qty_received) / pool.qty
          : 0;
    const allocatedCharges = p.qty_received > 0 ? lineShare / p.qty_received : 0;
    const netRefillRate = p.unit_refill_rate / vatDivisor;
    const landedRate = netRefillRate + allocatedCharges;
    const standardRate = standardRates.get(p.item_code) ?? 0;

    return {
      key: layerKey(p.po_no, p.po_line),
      transactionId: p.transaction_id,
      itemCode: p.item_code,
      owner: p.purchasing_department,
      receiptDate: p.receipt_date ?? p.po_date,
      netRefillRate,
      allocatedCharges,
      landedRate,
      quantity: p.qty_received,
      remaining: p.qty_received,
      receivedValue: landedRate * p.qty_received,
      priceVariance:
        settings.valuation === 'STD' ? (landedRate - standardRate) * p.qty_received : 0,
    };
  });

  // FIFO order: earliest receipt first, then PO number, then line.
  layers.sort(
    (a, b) => a.receiptDate.localeCompare(b.receiptDate) || a.key.localeCompare(b.key),
  );
  return layers;
}

export function layersByItem(layers: CostLayer[]): Map<string, CostLayer[]> {
  const byItem = new Map<string, CostLayer[]>();
  for (const layer of layers) {
    const list = byItem.get(layer.itemCode) ?? [];
    list.push(layer);
    byItem.set(layer.itemCode, list);
  }
  return byItem;
}

export function totalReceivedValue(layers: CostLayer[]): number {
  return sum(layers.map((l) => l.receivedValue));
}

export function standardRateMap(ledger: Pick<Ledger, 'items'>): Map<string, number> {
  return new Map(ledger.items.map((item) => [item.item_code, item.standard_rate]));
}
