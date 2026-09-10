import type { Movement, Settings } from '@/lib/types';
import type { CostLayer } from './layers';
import { normaliseLayerKey } from './layers';
import { monthKey } from './dates';
import { sum } from './money';

/** A slice taken out of one cost layer. */
export interface Draw {
  layerKey: string;
  owner: string;
  quantity: number;
  rate: number;
  value: number;
}

export interface ValuationIssue {
  severity: 'error' | 'warning';
  transactionId: string | null;
  itemCode: string;
  month: string;
  message: string;
}

/** What a month's consumption of one item cost, and who owned it. */
export interface MonthValuation {
  itemCode: string;
  month: string;
  demandQty: number;      // unlinked net demand
  drawnQty: number;       // actually available and drawn
  drawnValue: number;
  rate: number;           // the single rate every consumer pays this month
  ownerShares: Map<string, number>; // owner -> fraction of drawn value
  draws: Draw[];
}

/** Per-movement financial outcome, keyed by transaction id. */
export interface MovementValuation {
  transactionId: string;
  itemCode: string;
  month: string;
  /** Signed: positive consumes, negative credits back. */
  financialQty: number;
  rate: number;
  /** owner -> fraction of this movement's value. Sums to 1 when financialQty != 0. */
  ownerShares: Map<string, number>;
  consumer: string | null;
  linkedLayer: string | null;
}

export interface ValuationResult {
  months: MonthValuation[];
  movements: Map<string, MovementValuation>;
  issues: ValuationIssue[];
  /** Layers after every draw and restore, for the stock position. */
  layers: CostLayer[];
}

const STORE_ENDPOINTS = new Set<string>();

function isDepartment(code: string, settings: Settings): boolean {
  return (
    code !== settings.store_code &&
    code !== settings.supplier_code &&
    code !== settings.loss_code
  );
}

/**
 * The signed quantity a movement puts through the financial ledger, and the
 * department that carries it. Which movements bite depends on the charge
 * trigger: issue-based triggers charge when gas leaves the store, ON_RETURN
 * waits until the empty comes back.
 */
export function financialEffect(
  movement: Movement,
  settings: Settings,
): { qty: number; consumer: string | null } {
  const onReturn = settings.trigger_rule === 'ON_RETURN';

  switch (movement.kind) {
    case 'ISSUE':
      return onReturn
        ? { qty: 0, consumer: movement.to_code }
        : { qty: movement.quantity, consumer: movement.to_code };

    case 'RETURN_UNUSED':
      // Never consumed: credit the department and put the layer back.
      return { qty: -movement.quantity, consumer: movement.from_code };

    case 'RETURN_EMPTY':
      return onReturn
        ? { qty: movement.quantity, consumer: movement.from_code }
        : { qty: 0, consumer: movement.from_code };

    case 'ADJUSTMENT':
      // A cylinder written off to LOSS under ON_RETURN never comes back, so
      // the gas is charged here instead. Under issue triggers it was already
      // charged when it left the store.
      if (movement.to_code === settings.loss_code) {
        return onReturn
          ? { qty: movement.quantity, consumer: movement.from_code }
          : { qty: 0, consumer: movement.from_code };
      }
      return { qty: 0, consumer: null };

    case 'TRANSFER':
      // Reassigns an existing charge rather than creating one; handled by the
      // charge builder, which needs the original movement's rate.
      return { qty: 0, consumer: movement.to_code };

    default:
      return { qty: 0, consumer: null };
  }
}

/** Draws `wanted` cylinders FIFO from the item's remaining layers. */
function drawFifo(layers: CostLayer[], wanted: number): { draws: Draw[]; short: number } {
  const draws: Draw[] = [];
  let outstanding = wanted;

  for (const layer of layers) {
    if (outstanding <= 1e-9) break;
    const take = Math.min(layer.remaining, outstanding);
    if (take <= 1e-9) continue;
    layer.remaining -= take;
    outstanding -= take;
    draws.push({
      layerKey: layer.key,
      owner: layer.owner,
      quantity: take,
      rate: layer.landedRate,
      value: take * layer.landedRate,
    });
  }

  return { draws, short: outstanding > 1e-9 ? outstanding : 0 };
}

function sharesFromDraws(draws: Draw[]): Map<string, number> {
  const totalValue = sum(draws.map((d) => d.value));
  const shares = new Map<string, number>();
  if (totalValue <= 0) {
    // No value to split (a free layer, or nothing drawn): fall back to
    // quantity so the owner credit still lands somewhere sensible.
    const totalQty = sum(draws.map((d) => d.quantity));
    if (totalQty <= 0) return shares;
    for (const d of draws) shares.set(d.owner, (shares.get(d.owner) ?? 0) + d.quantity / totalQty);
    return shares;
  }
  for (const d of draws) shares.set(d.owner, (shares.get(d.owner) ?? 0) + d.value / totalValue);
  return shares;
}

/**
 * Values every movement.
 *
 * Months run in order. Within a month and item:
 *   1. unused returns put their source layer back,
 *   2. movements naming a source PO take that layer at its own landed rate,
 *   3. everything else shares one monthly FIFO rate, and owner credits are
 *      split pro-rata across the layers that month actually drew.
 *
 * Step 3 is the approximation the workbook warns about: the total is exact,
 * each owner-to-consumer pair is pro-rata.
 */
export function valueLedger(
  movements: Movement[],
  layers: CostLayer[],
  settings: Settings,
  standardRates: Map<string, number>,
): ValuationResult {
  const issues: ValuationIssue[] = [];
  const monthResults: MonthValuation[] = [];
  const perMovement = new Map<string, MovementValuation>();

  const layerByKey = new Map(layers.map((l) => [l.key, l]));
  const itemLayers = new Map<string, CostLayer[]>();
  for (const layer of layers) {
    const list = itemLayers.get(layer.itemCode) ?? [];
    list.push(layer);
    itemLayers.set(layer.itemCode, list);
  }

  // Group by month, then item, so FIFO consumes chronologically.
  const chronological = [...movements].sort(
    (a, b) => a.moved_on.localeCompare(b.moved_on) || a.transaction_id.localeCompare(b.transaction_id),
  );
  const byMonth = new Map<string, Movement[]>();
  for (const m of chronological) {
    const key = monthKey(m.moved_on);
    const list = byMonth.get(key) ?? [];
    list.push(m);
    byMonth.set(key, list);
  }

  for (const month of [...byMonth.keys()].sort()) {
    const monthMovements = byMonth.get(month)!;

    const byItem = new Map<string, Movement[]>();
    for (const m of monthMovements) {
      const list = byItem.get(m.item_code) ?? [];
      list.push(m);
      byItem.set(m.item_code, list);
    }

    for (const [itemCode, itemMovements] of byItem) {
      const available = itemLayers.get(itemCode) ?? [];
      const standardRate = standardRates.get(itemCode) ?? 0;

      const linked: Movement[] = [];
      const unlinked: Movement[] = [];
      for (const m of itemMovements) {
        const { qty } = financialEffect(m, settings);
        if (qty === 0) continue;
        const hasLink = settings.honour_po_link && !!m.source_po_line;
        (hasLink ? linked : unlinked).push(m);
      }

      // --- 1 & 2: explicit source-PO lines, restores before draws.
      const restores = linked.filter((m) => financialEffect(m, settings).qty < 0);
      const takes = linked.filter((m) => financialEffect(m, settings).qty > 0);

      for (const m of [...restores, ...takes]) {
        const { qty, consumer } = financialEffect(m, settings);
        const key = normaliseLayerKey(m.source_po_line!);
        const layer = layerByKey.get(key);

        if (!layer || layer.itemCode !== itemCode) {
          issues.push({
            severity: 'error',
            transactionId: m.transaction_id,
            itemCode,
            month,
            message: `Source PO ${m.source_po_line} does not match a received layer for ${itemCode}.`,
          });
          // Value it at the item's standard rate so the report still foots.
          perMovement.set(m.transaction_id, {
            transactionId: m.transaction_id,
            itemCode,
            month,
            financialQty: qty,
            rate: standardRate,
            ownerShares: new Map([[settings.purchasing_department ?? 'UNKNOWN', 1]]),
            consumer,
            linkedLayer: null,
          });
          continue;
        }

        if (qty > 0 && layer.remaining + 1e-9 < qty) {
          issues.push({
            severity: 'error',
            transactionId: m.transaction_id,
            itemCode,
            month,
            message: `Source PO ${layer.key} has ${layer.remaining} left but ${qty} was drawn. An earlier month's FIFO already took it.`,
          });
        }

        layer.remaining -= qty; // negative qty (a restore) puts stock back
        perMovement.set(m.transaction_id, {
          transactionId: m.transaction_id,
          itemCode,
          month,
          financialQty: qty,
          rate: layer.landedRate,
          ownerShares: new Map([[layer.owner, 1]]),
          consumer,
          linkedLayer: layer.key,
        });
      }

      // --- 3: everything else shares one monthly rate.
      const netDemand = sum(unlinked.map((m) => financialEffect(m, settings).qty));

      let monthRate = standardRate;
      let shares = new Map<string, number>();
      let draws: Draw[] = [];
      let drawnQty = 0;
      let drawnValue = 0;

      if (Math.abs(netDemand) > 1e-9) {
        if (netDemand > 0) {
          const result = drawFifo(available, netDemand);
          draws = result.draws;
          drawnQty = sum(draws.map((d) => d.quantity));
          drawnValue = sum(draws.map((d) => d.value));

          if (result.short > 0) {
            issues.push({
              severity: 'error',
              transactionId: null,
              itemCode,
              month,
              message: `${itemCode}: ${result.short} cylinder(s) issued with no purchase layer to draw from. The shortfall is valued at the standard rate.`,
            });
            // Value the shortfall at standard so nothing silently disappears.
            drawnValue += result.short * standardRate;
            drawnQty += result.short;
            const fallbackOwner = settings.purchasing_department ?? 'UNKNOWN';
            draws.push({
              layerKey: 'SHORTFALL',
              owner: fallbackOwner,
              quantity: result.short,
              rate: standardRate,
              value: result.short * standardRate,
            });
          }
        } else {
          // Net credit with no explicit layer: return it to the most recently
          // drawn layers so stock and value both come back.
          let toRestore = -netDemand;
          for (let i = available.length - 1; i >= 0 && toRestore > 1e-9; i -= 1) {
            const layer = available[i];
            const room = layer.quantity - layer.remaining;
            const give = Math.min(room, toRestore);
            if (give <= 1e-9) continue;
            layer.remaining += give;
            toRestore -= give;
            draws.push({
              layerKey: layer.key,
              owner: layer.owner,
              quantity: -give,
              rate: layer.landedRate,
              value: -give * layer.landedRate,
            });
          }
          drawnQty = sum(draws.map((d) => d.quantity));
          drawnValue = sum(draws.map((d) => d.value));
        }

        switch (settings.valuation) {
          case 'STD':
            monthRate = standardRate;
            break;
          case 'WAC': {
            // Weighted average of every layer of this item received to date.
            const pool = available.filter((l) => l.receiptDate.slice(0, 7) <= month);
            const poolQty = sum(pool.map((l) => l.quantity));
            monthRate = poolQty > 0 ? sum(pool.map((l) => l.receivedValue)) / poolQty : standardRate;
            break;
          }
          default:
            monthRate = drawnQty !== 0 ? drawnValue / drawnQty : standardRate;
        }

        shares = sharesFromDraws(draws.map((d) => ({ ...d, value: Math.abs(d.value), quantity: Math.abs(d.quantity) })));

        monthResults.push({
          itemCode,
          month,
          demandQty: netDemand,
          drawnQty,
          drawnValue,
          rate: monthRate,
          ownerShares: shares,
          draws,
        });
      }

      for (const m of unlinked) {
        const { qty, consumer } = financialEffect(m, settings);
        perMovement.set(m.transaction_id, {
          transactionId: m.transaction_id,
          itemCode,
          month,
          financialQty: qty,
          rate: monthRate,
          ownerShares: new Map(shares),
          consumer,
          linkedLayer: null,
        });
      }
    }
  }

  return { months: monthResults, movements: perMovement, issues, layers };
}

export { isDepartment, STORE_ENDPOINTS };
