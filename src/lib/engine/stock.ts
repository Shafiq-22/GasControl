import type { GasItem, Movement, Purchase, Settings } from '@/lib/types';
import type { CostLayer } from './layers';
import { daysBetween, todayIso } from './dates';
import { sum } from './money';

export interface StockRow {
  itemCode: string;
  description: string;
  unit: string;
  fullInStore: number;
  out: Map<string, number>;   // department -> cylinders held
  totalOut: number;
  emptiesInStore: number;
  /** Under ASSUME_ALL_OUT every cylinder with a department counts as an
   *  assumed empty. It is an estimate of state, not extra stock. */
  assumedEmptiesOut: number;
  returnedToSupplier: number;
  lostShells: number;
  totalOnSite: number;
  stockValue: number;
  ownerStock: Map<string, number>; // owner -> value of layers still in store
  reorderPoint: number;
  belowReorder: boolean;
  belowMinimum: boolean;
  daysCover: number | null;
  priceVariance: number;
  /** Conservation residuals; both are zero when the registers agree. */
  cylinderBalance: number;
  layerBalance: number;
}

const TRAILING_DAYS = 90;

/**
 * Physical and financial position per item.
 *
 * Physical quantities come only from the registers. Value comes only from
 * what is left in the cost layers, so the two can be cross-checked against
 * each other rather than being two views of one number.
 */
export function buildStock(
  items: GasItem[],
  purchases: Purchase[],
  movements: Movement[],
  layers: CostLayer[],
  settings: Settings,
  departments: string[],
  asOf = todayIso(),
): StockRow[] {
  const { store_code: STORE, supplier_code: SUPPLIER, loss_code: LOSS } = settings;
  const issueTriggered = settings.trigger_rule !== 'ON_RETURN';

  return items.map((item) => {
    const itemPurchases = purchases.filter((p) => p.item_code === item.item_code);
    const itemMovements = movements.filter((m) => m.item_code === item.item_code);
    const itemLayers = layers.filter((l) => l.itemCode === item.item_code);

    const receivedQty = sum(itemPurchases.map((p) => p.qty_received));

    const out = new Map<string, number>(departments.map((d) => [d, 0]));
    const bump = (dept: string, delta: number) => {
      if (!out.has(dept)) return;
      out.set(dept, (out.get(dept) ?? 0) + delta);
    };

    let fullInStore = receivedQty;
    let emptiesInStore = 0;
    let returnedToSupplier = 0;
    let lostShells = 0;

    for (const m of itemMovements) {
      switch (m.kind) {
        case 'ISSUE':
          fullInStore -= m.quantity;
          bump(m.to_code, m.quantity);
          break;
        case 'RETURN_UNUSED':
          fullInStore += m.quantity;
          bump(m.from_code, -m.quantity);
          break;
        case 'RETURN_EMPTY':
          emptiesInStore += m.quantity;
          bump(m.from_code, -m.quantity);
          break;
        case 'TO_SUPPLIER':
          emptiesInStore -= m.quantity;
          returnedToSupplier += m.quantity;
          break;
        case 'TRANSFER':
          bump(m.from_code, -m.quantity);
          bump(m.to_code, m.quantity);
          break;
        case 'ADJUSTMENT':
          if (m.to_code === LOSS) {
            lostShells += m.quantity;
            if (m.from_code === STORE) fullInStore -= m.quantity;
            else bump(m.from_code, -m.quantity);
          } else if (m.from_code === STORE && m.to_code === STORE) {
            // A stock correction recorded against the store itself.
            fullInStore += m.quantity;
          } else if (m.from_code === SUPPLIER && m.to_code === STORE) {
            emptiesInStore += m.quantity;
            returnedToSupplier -= m.quantity;
          }
          break;
      }
    }

    const totalOut = sum([...out.values()]);
    const totalOnSite = fullInStore + totalOut + emptiesInStore;

    const ownerStock = new Map<string, number>();
    let stockValue = 0;
    for (const layer of itemLayers) {
      const value = layer.remaining * layer.landedRate;
      stockValue += value;
      ownerStock.set(layer.owner, (ownerStock.get(layer.owner) ?? 0) + value);
    }

    // Trailing consumption drives days of cover.
    const trailingIssues = itemMovements.filter(
      (m) => m.kind === 'ISSUE' && daysBetween(m.moved_on, asOf) <= TRAILING_DAYS && daysBetween(m.moved_on, asOf) >= 0,
    );
    const dailyRate = sum(trailingIssues.map((m) => m.quantity)) / TRAILING_DAYS;
    const daysCover = dailyRate > 0 ? fullInStore / dailyRate : null;

    // Every cylinder received is in the store, with a department, empty on
    // the rack, back at the supplier or written off. Anything else is an
    // entry error.
    const cylinderBalance = totalOnSite + returnedToSupplier + lostShells - receivedQty;

    // Layers deplete exactly as cylinders leave the store, so a difference
    // means the valuation and the register have drifted apart. Under
    // ON_RETURN gas is charged later than it moves, so the check does not
    // apply.
    const remainingLayerQty = sum(itemLayers.map((l) => l.remaining));
    const layerBalance = issueTriggered ? fullInStore - remainingLayerQty : 0;

    return {
      itemCode: item.item_code,
      description: item.description,
      unit: item.unit,
      fullInStore,
      out,
      totalOut,
      emptiesInStore,
      assumedEmptiesOut: settings.empty_state_policy === 'ASSUME_ALL_OUT' ? totalOut : 0,
      returnedToSupplier,
      lostShells,
      totalOnSite,
      stockValue,
      ownerStock,
      reorderPoint: item.reorder_point,
      belowReorder: fullInStore <= item.reorder_point,
      belowMinimum: fullInStore < item.minimum_stock,
      daysCover,
      priceVariance: sum(itemLayers.map((l) => l.priceVariance)),
      cylinderBalance,
      layerBalance,
    };
  });
}

/** Running store balance by date, used to spot a negative day. */
export function storeBalanceTimeline(
  itemCode: string,
  purchases: Purchase[],
  movements: Movement[],
): { date: string; balance: number }[] {
  const events: { date: string; delta: number }[] = [];

  for (const p of purchases) {
    if (p.item_code !== itemCode || p.qty_received <= 0 || !p.receipt_date) continue;
    events.push({ date: p.receipt_date, delta: p.qty_received });
  }
  for (const m of movements) {
    if (m.item_code !== itemCode) continue;
    if (m.kind === 'ISSUE') events.push({ date: m.moved_on, delta: -m.quantity });
    else if (m.kind === 'RETURN_UNUSED') events.push({ date: m.moved_on, delta: m.quantity });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  const timeline: { date: string; balance: number }[] = [];
  let balance = 0;
  for (const event of events) {
    balance += event.delta;
    const last = timeline[timeline.length - 1];
    if (last && last.date === event.date) last.balance = balance;
    else timeline.push({ date: event.date, balance });
  }
  return timeline;
}
