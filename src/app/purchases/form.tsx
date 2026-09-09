'use client';

import { useState } from 'react';
import { recordPurchase } from '@/lib/actions';
import { ActionForm, Field, Submit } from '@/components/form';
import type { Department, GasItem, Supplier } from '@/lib/types';

export function PurchaseForm({
  departments,
  items,
  suppliers,
  defaultDepartment,
  today,
}: {
  departments: Department[];
  items: GasItem[];
  suppliers: Supplier[];
  defaultDepartment: string | null;
  today: string;
}) {
  const [ordered, setOrdered] = useState('');
  const [rate, setRate] = useState('');
  const [delivery, setDelivery] = useState('0');
  const [other, setOther] = useState('0');
  const [received, setReceived] = useState('');

  const qtyReceived = Number(received || 0);
  const lineNet = Number(ordered || 0) * Number(rate || 0) + Number(delivery || 0) + Number(other || 0);
  const landed = qtyReceived > 0
    ? Number(rate || 0) + (Number(delivery || 0) + Number(other || 0)) / qtyReceived
    : Number(rate || 0);

  return (
    <ActionForm action={recordPurchase} resetOnSuccess>
      {(state) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="PO date" name="po_date" error={state?.fieldErrors?.po_date}>
              <input id="po_date" name="po_date" type="date" className="field" required defaultValue={today} />
            </Field>
            <Field label="PO number" name="po_no" error={state?.fieldErrors?.po_no}>
              <input id="po_no" name="po_no" className="field" required placeholder="PO1042" />
            </Field>
            <Field label="PO line" name="po_line" error={state?.fieldErrors?.po_line}>
              <input id="po_line" name="po_line" type="number" min={1} step={1} className="field" required defaultValue={1} />
            </Field>
            <Field label="Supplier" name="vendor_no" error={state?.fieldErrors?.vendor_no}>
              <select id="vendor_no" name="vendor_no" className="field" defaultValue="">
                <option value="">—</option>
                {suppliers.filter((s) => s.active).map((s) => (
                  <option key={s.vendor_no} value={s.vendor_no}>{s.vendor_no} · {s.name}</option>
                ))}
              </select>
            </Field>

            <Field
              label="Purchasing department"
              name="purchasing_department"
              error={state?.fieldErrors?.purchasing_department}
              hint="Owns this layer and is credited when others draw from it"
            >
              <select id="purchasing_department" name="purchasing_department" className="field" required
                      defaultValue={defaultDepartment ?? ''}>
                <option value="" disabled>Choose…</option>
                {departments.filter((d) => d.active).map((d) => (
                  <option key={d.code} value={d.code}>{d.code} · {d.full_name}</option>
                ))}
              </select>
            </Field>
            <Field label="Item" name="item_code" error={state?.fieldErrors?.item_code}>
              <select id="item_code" name="item_code" className="field" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {items.filter((i) => i.active).map((i) => (
                  <option key={i.item_code} value={i.item_code}>{i.item_code} · {i.description}</option>
                ))}
              </select>
            </Field>
            <Field label="Qty ordered" name="qty_ordered" error={state?.fieldErrors?.qty_ordered}>
              <input id="qty_ordered" name="qty_ordered" type="number" min="0.01" step="0.01" className="field num"
                     required value={ordered} onChange={(e) => setOrdered(e.target.value)} />
            </Field>
            <Field label="Unit refill rate" name="unit_refill_rate" error={state?.fieldErrors?.unit_refill_rate}>
              <input id="unit_refill_rate" name="unit_refill_rate" type="number" min="0" step="0.0001" className="field num"
                     required value={rate} onChange={(e) => setRate(e.target.value)} />
            </Field>

            <Field label="Delivery charge" name="delivery_charge" error={state?.fieldErrors?.delivery_charge}
                   hint="Entered once for the PO">
              <input id="delivery_charge" name="delivery_charge" type="number" min="0" step="0.01" className="field num"
                     value={delivery} onChange={(e) => setDelivery(e.target.value)} />
            </Field>
            <Field label="Other charges" name="other_charges" error={state?.fieldErrors?.other_charges}>
              <input id="other_charges" name="other_charges" type="number" min="0" step="0.01" className="field num"
                     value={other} onChange={(e) => setOther(e.target.value)} />
            </Field>
            <Field label="Qty received" name="qty_received" error={state?.fieldErrors?.qty_received}
                   hint="A fully received line becomes a cost layer">
              <input id="qty_received" name="qty_received" type="number" min="0" step="0.01" className="field num"
                     value={received} onChange={(e) => setReceived(e.target.value)} />
            </Field>
            <Field label="Receipt date" name="receipt_date" error={state?.fieldErrors?.receipt_date}>
              <input id="receipt_date" name="receipt_date" type="date" className="field" defaultValue={today} />
            </Field>

            <Field label="Received by" name="received_by" error={state?.fieldErrors?.received_by}>
              <input id="received_by" name="received_by" className="field" />
            </Field>
            <Field label="Remarks" name="remarks" className="sm:col-span-2 lg:col-span-3">
              <input id="remarks" name="remarks" className="field" />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs" style={{ color: 'var(--text-soft)' }}>
              Line net {lineNet.toFixed(2)} · landed rate {landed.toFixed(4)} per cylinder
            </p>
            <Submit>Record purchase</Submit>
          </div>
        </>
      )}
    </ActionForm>
  );
}
