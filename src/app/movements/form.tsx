'use client';

import { useMemo, useState } from 'react';
import { recordMovement } from '@/lib/actions';
import { ActionForm, Field, Submit } from '@/components/form';
import { MOVEMENT_KINDS, type CostCode, type Department, type GasItem, type MovementKind, type Person, type Settings } from '@/lib/types';

/**
 * Each movement type has a fixed shape: where it can come from and go to,
 * and which fields matter. Driving the form from this table keeps the UI and
 * the engine's rules describing the same thing.
 */
const SHAPE: Record<MovementKind, {
  label: string;
  help: string;
  from: 'store' | 'department' | 'supplier';
  to: 'store' | 'department' | 'supplier' | 'loss';
  needsSourcePo: boolean;
  needsOriginal: boolean;
  showResidual: boolean;
  showReason: boolean;
}> = {
  ISSUE:         { label: 'Issue to a department',    help: 'Full cylinders leave the store. This is what gets charged.',            from: 'store',      to: 'department', needsSourcePo: false, needsOriginal: false, showResidual: false, showReason: false },
  RETURN_EMPTY:  { label: 'Empty returned to store',  help: 'The gas was used. No further charge under an issue-based trigger.',     from: 'department', to: 'store',      needsSourcePo: false, needsOriginal: false, showResidual: true,  showReason: false },
  RETURN_UNUSED: { label: 'Unused cylinder returned', help: 'Still full. Credits the department and restores the source layer.',      from: 'department', to: 'store',      needsSourcePo: true,  needsOriginal: false, showResidual: false, showReason: false },
  TRANSFER:      { label: 'Transfer between depts',   help: 'Moves an existing charge. Priced from the issue it references.',        from: 'department', to: 'department', needsSourcePo: false, needsOriginal: true,  showResidual: false, showReason: false },
  TO_SUPPLIER:   { label: 'Empties collected',        help: 'Empty cylinders go back to the supplier.',                              from: 'store',      to: 'supplier',   needsSourcePo: false, needsOriginal: false, showResidual: false, showReason: false },
  ADJUSTMENT:    { label: 'Loss or correction',       help: 'A written-off shell, or a counted correction. Always give a reason.',   from: 'department', to: 'loss',       needsSourcePo: false, needsOriginal: false, showResidual: false, showReason: true  },
};

export function MovementForm({
  settings,
  departments,
  items,
  costCodes,
  personnel,
  layerKeys,
  issueOptions,
  today,
}: {
  settings: Settings;
  departments: Department[];
  items: GasItem[];
  costCodes: CostCode[];
  personnel: Person[];
  layerKeys: { key: string; itemCode: string; remaining: number }[];
  issueOptions: { id: string; label: string; itemCode: string; department: string }[];
  today: string;
}) {
  const [kind, setKind] = useState<MovementKind>('ISSUE');
  const [itemCode, setItemCode] = useState('');
  const [toCode, setToCode] = useState('');
  const [fromCode, setFromCode] = useState(settings.store_code);

  const shape = SHAPE[kind];
  const activeDepartments = departments.filter((d) => d.active);

  const endpointOptions = (slot: 'store' | 'department' | 'supplier' | 'loss') => {
    switch (slot) {
      case 'store': return [{ value: settings.store_code, label: `${settings.store_code} (shared store)` }];
      case 'supplier': return [{ value: settings.supplier_code, label: `${settings.supplier_code} (returned to supplier)` }];
      case 'loss': return [{ value: settings.loss_code, label: `${settings.loss_code} (written off)` }];
      default: return activeDepartments.map((d) => ({ value: d.code, label: `${d.code} · ${d.full_name}` }));
    }
  };

  // The consumer carries the cost, so only that department's codes apply.
  const consumer = shape.to === 'department' ? toCode : shape.from === 'department' ? fromCode : '';
  const availableCostCodes = useMemo(
    () => costCodes.filter((c) => c.active && (!consumer || c.owning_department === consumer)),
    [costCodes, consumer],
  );
  const availableReceivers = useMemo(
    () => personnel.filter((p) => p.active && (!consumer || p.department === consumer)),
    [personnel, consumer],
  );
  const availableLayers = useMemo(
    () => layerKeys.filter((l) => !itemCode || l.itemCode === itemCode),
    [layerKeys, itemCode],
  );
  const availableIssues = useMemo(
    () => issueOptions.filter((o) => (!itemCode || o.itemCode === itemCode) && (!fromCode || o.department === fromCode)),
    [issueOptions, itemCode, fromCode],
  );

  const needsContext = kind === 'ISSUE' || kind === 'TRANSFER';

  function chooseKind(next: MovementKind) {
    setKind(next);
    const nextShape = SHAPE[next];
    setFromCode(nextShape.from === 'store' ? settings.store_code : '');
    setToCode(
      nextShape.to === 'store' ? settings.store_code
      : nextShape.to === 'supplier' ? settings.supplier_code
      : nextShape.to === 'loss' ? settings.loss_code
      : '',
    );
  }

  return (
    <ActionForm action={recordMovement} resetOnSuccess>
      {(state) => (
        <>
          <div className="mb-4 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {MOVEMENT_KINDS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => chooseKind(option)}
                aria-pressed={kind === option}
                className="rounded-lg border px-3 py-2 text-left"
                style={
                  kind === option
                    ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
                    : { borderColor: 'var(--line)' }
                }
              >
                <span className="block text-[0.8125rem] font-semibold">{SHAPE[option].label}</span>
                <span className="block text-xs" style={{ color: 'var(--text-soft)' }}>
                  {SHAPE[option].help}
                </span>
              </button>
            ))}
          </div>

          <input type="hidden" name="kind" value={kind} />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date" name="moved_on" error={state?.fieldErrors?.moved_on}>
              <input id="moved_on" name="moved_on" type="date" className="field" required defaultValue={today} />
            </Field>

            <Field label="Item" name="item_code" error={state?.fieldErrors?.item_code}>
              <select id="item_code" name="item_code" className="field" required
                      value={itemCode} onChange={(e) => setItemCode(e.target.value)}>
                <option value="" disabled>Choose…</option>
                {items.filter((i) => i.active).map((i) => (
                  <option key={i.item_code} value={i.item_code}>{i.item_code} · {i.description}</option>
                ))}
              </select>
            </Field>

            <Field label="Quantity" name="quantity" error={state?.fieldErrors?.quantity}>
              <input id="quantity" name="quantity" type="number" min="0.01" step="0.01" className="field num" required />
            </Field>

            <Field label="From" name="from_code" error={state?.fieldErrors?.from_code}>
              <select id="from_code" name="from_code" className="field" required
                      value={fromCode} onChange={(e) => setFromCode(e.target.value)}>
                <option value="" disabled>Choose…</option>
                {endpointOptions(shape.from).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            <Field label="To" name="to_code" error={state?.fieldErrors?.to_code}>
              <select id="to_code" name="to_code" className="field" required
                      value={toCode} onChange={(e) => setToCode(e.target.value)}>
                <option value="" disabled>Choose…</option>
                {endpointOptions(shape.to).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            {needsContext && (
              <>
                <Field
                  label={`Receiver${settings.require_receiver ? '' : ' (optional)'}`}
                  name="receiver_name"
                  error={state?.fieldErrors?.receiver_name}
                  hint={consumer ? `Personnel in ${consumer}` : 'Choose the department first'}
                >
                  <select id="receiver_name" name="receiver_name" className="field"
                          required={settings.require_receiver} defaultValue="">
                    <option value="">—</option>
                    {availableReceivers.map((p) => (
                      <option key={p.employee_no} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </Field>

                <Field
                  label={`Cost code${settings.require_cost_code ? '' : ' (optional)'}`}
                  name="cost_code"
                  error={state?.fieldErrors?.cost_code}
                  hint={consumer ? `Codes owned by ${consumer}` : 'Choose the department first'}
                >
                  <select id="cost_code" name="cost_code" className="field"
                          required={settings.require_cost_code} defaultValue="">
                    <option value="">—</option>
                    {availableCostCodes.map((c) => (
                      <option key={c.code} value={c.code}>{c.code} · {c.description}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}

            <Field
              label={`Source PO line${shape.needsSourcePo ? '' : ' (optional)'}`}
              name="source_po_line"
              error={state?.fieldErrors?.source_po_line}
              hint={
                shape.needsSourcePo
                  ? 'The layer this cylinder came from'
                  : settings.honour_po_link
                    ? 'Reserves a specific layer at its own rate and owner'
                    : 'Source PO links are switched off in Settings'
              }
            >
              <select id="source_po_line" name="source_po_line" className="field"
                      required={shape.needsSourcePo} defaultValue="">
                <option value="">—</option>
                {availableLayers.map((l) => (
                  <option key={l.key} value={l.key}>{l.key} · {l.remaining} left</option>
                ))}
              </select>
            </Field>

            {(shape.needsOriginal || kind === 'RETURN_EMPTY' || kind === 'ADJUSTMENT') && (
              <Field
                label={`Original issue${shape.needsOriginal ? '' : ' (optional)'}`}
                name="original_transaction_id"
                error={state?.fieldErrors?.original_transaction_id}
                hint={shape.needsOriginal ? 'The transfer is priced from this issue' : 'Links the return to what went out'}
              >
                <select id="original_transaction_id" name="original_transaction_id" className="field"
                        required={shape.needsOriginal} defaultValue="">
                  <option value="">—</option>
                  {availableIssues.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </Field>
            )}

            {shape.showResidual && (
              <Field label="Residual %" name="residual_pct" error={state?.fieldErrors?.residual_pct}
                     hint="Gas left in the cylinder, if measured">
                <input id="residual_pct" name="residual_pct" type="number" min="0" max="100" step="0.01" className="field num" />
              </Field>
            )}

            {shape.showReason && (
              <Field label="Reason" name="reason" error={state?.fieldErrors?.reason} className="sm:col-span-2">
                <input id="reason" name="reason" className="field" required
                       placeholder="Lost cylinder shell; gas already charged" />
              </Field>
            )}

            <Field label="Location / area" name="location_area">
              <input id="location_area" name="location_area" className="field" />
            </Field>

            <Field label="Remarks" name="remarks" className="sm:col-span-2">
              <input id="remarks" name="remarks" className="field" />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs" style={{ color: 'var(--text-soft)' }}>
              {shape.help} Corrections are appended as further rows; nothing is overwritten.
            </p>
            <Submit>Record movement</Submit>
          </div>
        </>
      )}
    </ActionForm>
  );
}
