import type { Movement, Settings } from '@/lib/types';
import type { MovementValuation } from './valuation';
import { monthKey } from './dates';
import { apportion, round, sum } from './money';

/**
 * One line of the owner-to-consumer backcharge: department `owner` paid for
 * this gas, department `consumer` used it. A charge where the two match is
 * own consumption and never settles between departments.
 */
export interface Charge {
  date: string;
  month: string;
  owner: string;
  consumer: string;
  itemCode: string;
  quantity: number;
  unitRate: number;
  amount: number;
  sourcePo: string | null;
  costCode: string | null;
  reference: string;
  note: string | null;
}

function isDepartmentCode(code: string | null, settings: Settings): code is string {
  return (
    !!code &&
    code !== settings.store_code &&
    code !== settings.supplier_code &&
    code !== settings.loss_code
  );
}

/**
 * Expands valued movements into charge lines, one per owner drawn.
 *
 * A transfer moves an existing charge between departments: the sending
 * department is credited and the receiving one debited, both at the original
 * issue's rate and owner mix, so the store's total consumption is unchanged.
 */
export function buildCharges(
  movements: Movement[],
  valued: Map<string, MovementValuation>,
  settings: Settings,
): Charge[] {
  const charges: Charge[] = [];
  const decimals = settings.posting_decimals;
  const byId = new Map(movements.map((m) => [m.transaction_id, m]));

  const emit = (
    movement: Movement,
    consumer: string,
    quantity: number,
    rate: number,
    shares: Map<string, number>,
    sourcePo: string | null,
    note: string | null,
  ) => {
    if (Math.abs(quantity) < 1e-9) return;
    const owners = [...shares.entries()].filter(([, share]) => Math.abs(share) > 1e-9);
    if (owners.length === 0) return;

    const gross = quantity * rate;
    const weights = owners.map(([, share]) => share);
    // Split by value first so the parts always add back to the gross amount,
    // then derive each owner's quantity from the same weights.
    const amounts = apportion(gross, weights, decimals);
    const quantities = apportion(quantity, weights, 4);

    owners.forEach(([owner], index) => {
      // Uplift is an interdepartment recharge margin; own use is at cost.
      const uplift = owner === consumer ? 0 : settings.backcharge_uplift;
      const amount = round(amounts[index] * (1 + uplift), decimals);
      if (amount === 0 && quantities[index] === 0) return;
      charges.push({
        date: movement.moved_on,
        month: monthKey(movement.moved_on),
        owner,
        consumer,
        itemCode: movement.item_code,
        quantity: quantities[index],
        unitRate: round(rate * (1 + uplift), 4),
        amount,
        sourcePo,
        costCode: movement.cost_code,
        reference: movement.transaction_id,
        note,
      });
    });
  };

  for (const movement of movements) {
    if (movement.kind === 'TRANSFER') {
      const previousConsumer = movement.from_code;
      const newConsumer = movement.to_code;
      if (!isDepartmentCode(previousConsumer, settings) || !isDepartmentCode(newConsumer, settings)) {
        continue;
      }
      if (previousConsumer === newConsumer) continue;

      // Price the transfer off the issue it references, so moving a cylinder
      // between departments never revalues it.
      const origin = movement.original_transaction_id
        ? valued.get(movement.original_transaction_id)
        : undefined;
      const originMovement = movement.original_transaction_id
        ? byId.get(movement.original_transaction_id)
        : undefined;

      if (!origin || origin.financialQty === 0) continue;

      const rate = origin.rate;
      const shares = origin.ownerShares;
      const sourcePo = originMovement?.source_po_line ?? null;
      const reference = movement.original_transaction_id ?? movement.transaction_id;

      emit(movement, previousConsumer, -movement.quantity, rate, shares, sourcePo,
        `Transferred to ${newConsumer} (${reference})`);
      emit(movement, newConsumer, movement.quantity, rate, shares, sourcePo,
        `Transferred from ${previousConsumer} (${reference})`);
      continue;
    }

    const valuation = valued.get(movement.transaction_id);
    if (!valuation || valuation.financialQty === 0) continue;
    if (!isDepartmentCode(valuation.consumer, settings)) continue;

    const note =
      movement.kind === 'RETURN_UNUSED'
        ? 'Unused return credit'
        : movement.kind === 'ADJUSTMENT'
          ? movement.reason
          : null;

    emit(
      movement,
      valuation.consumer,
      valuation.financialQty,
      valuation.rate,
      valuation.ownerShares,
      movement.source_po_line,
      note,
    );
  }

  return charges.sort(
    (a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference),
  );
}

export function chargesForMonth(charges: Charge[], reportMonth: string): Charge[] {
  const key = reportMonth.slice(0, 7);
  return charges.filter((c) => c.month === key);
}

// ------------------------------------------------------------------ matrix

export interface BackchargeMatrix {
  departments: string[];
  /** cell[owner][consumer] */
  cell: Map<string, Map<string, number>>;
  rowTotal: Map<string, number>;
  columnTotal: Map<string, number>;
  ownConsumption: Map<string, number>;
  chargedOut: Map<string, number>;
  chargedIn: Map<string, number>;
  netReceivable: Map<string, number>;
  grandTotal: number;
}

export function buildMatrix(charges: Charge[], departments: string[]): BackchargeMatrix {
  const cell = new Map<string, Map<string, number>>();
  for (const owner of departments) {
    cell.set(owner, new Map(departments.map((consumer) => [consumer, 0])));
  }

  for (const charge of charges) {
    const row = cell.get(charge.owner);
    if (!row || !row.has(charge.consumer)) continue;
    row.set(charge.consumer, (row.get(charge.consumer) ?? 0) + charge.amount);
  }

  const rowTotal = new Map<string, number>();
  const columnTotal = new Map<string, number>();
  const ownConsumption = new Map<string, number>();
  const chargedOut = new Map<string, number>();
  const chargedIn = new Map<string, number>();
  const netReceivable = new Map<string, number>();

  for (const owner of departments) {
    const row = cell.get(owner)!;
    rowTotal.set(owner, sum([...row.values()]));
    ownConsumption.set(owner, row.get(owner) ?? 0);
    chargedOut.set(
      owner,
      sum(departments.filter((d) => d !== owner).map((d) => row.get(d) ?? 0)),
    );
  }
  for (const consumer of departments) {
    columnTotal.set(consumer, sum(departments.map((owner) => cell.get(owner)!.get(consumer) ?? 0)));
    chargedIn.set(
      consumer,
      sum(departments.filter((d) => d !== consumer).map((owner) => cell.get(owner)!.get(consumer) ?? 0)),
    );
  }
  for (const dept of departments) {
    netReceivable.set(dept, (chargedOut.get(dept) ?? 0) - (chargedIn.get(dept) ?? 0));
  }

  return {
    departments,
    cell,
    rowTotal,
    columnTotal,
    ownConsumption,
    chargedOut,
    chargedIn,
    netReceivable,
    grandTotal: sum([...rowTotal.values()]),
  };
}

export interface Settlement {
  from: string; // pays
  to: string;   // receives
  amount: number;
}

/** Nets each department pair down to a single payment. */
export function buildSettlements(matrix: BackchargeMatrix, tolerance: number): Settlement[] {
  const settlements: Settlement[] = [];
  const { departments, cell } = matrix;

  for (let i = 0; i < departments.length; i += 1) {
    for (let j = i + 1; j < departments.length; j += 1) {
      const x = departments[i];
      const y = departments[j];
      const net = (cell.get(x)!.get(y) ?? 0) - (cell.get(y)!.get(x) ?? 0);
      if (Math.abs(net) <= tolerance) continue;
      settlements.push(
        net > 0 ? { from: y, to: x, amount: net } : { from: x, to: y, amount: -net },
      );
    }
  }
  return settlements;
}
