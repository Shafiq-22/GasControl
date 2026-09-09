'use client';

import { saveSettings } from '@/lib/actions';
import { ActionForm, Field, Submit } from '@/components/form';
import { Card } from '@/components/ui';
import type { Department, Settings } from '@/lib/types';

function Toggle({
  name, label, hint, defaultChecked, disabled,
}: {
  name: string; label: string; hint: string; defaultChecked: boolean; disabled: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3"
           style={{ borderColor: 'var(--line)' }}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} className="mt-0.5" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs" style={{ color: 'var(--text-soft)' }}>{hint}</span>
      </span>
    </label>
  );
}

export function SettingsForm({
  settings,
  departments,
  editable,
}: {
  settings: Settings;
  departments: Department[];
  editable: boolean;
}) {
  const disabled = !editable;

  return (
    <ActionForm action={saveSettings}>
      {(state) => (
        <div className="grid gap-4">
          <Card title="Organisation">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Company name" name="company_name" error={state?.fieldErrors?.company_name}>
                <input id="company_name" name="company_name" className="field" required
                       defaultValue={settings.company_name} disabled={disabled} />
              </Field>
              <Field label="Store name" name="store_name" error={state?.fieldErrors?.store_name}>
                <input id="store_name" name="store_name" className="field" required
                       defaultValue={settings.store_name} disabled={disabled} />
              </Field>
              <Field label="Custodian" name="custodian" error={state?.fieldErrors?.custodian}
                     hint="The single person responsible for the register">
                <input id="custodian" name="custodian" className="field" required
                       defaultValue={settings.custodian} disabled={disabled} />
              </Field>
              <Field label="Currency code" name="currency_code" error={state?.fieldErrors?.currency_code}>
                <input id="currency_code" name="currency_code" className="field" required maxLength={8}
                       defaultValue={settings.currency_code} disabled={disabled} />
              </Field>
              <Field label="Accounting account code" name="posting_account" error={state?.fieldErrors?.posting_account}
                     hint="Written onto every dayworks line">
                <input id="posting_account" name="posting_account" className="field" required
                       defaultValue={settings.posting_account} disabled={disabled} />
              </Field>
              <Field label="Stock unit" name="stock_unit">
                <input id="stock_unit" name="stock_unit" className="field" required
                       defaultValue={settings.stock_unit} disabled={disabled} />
              </Field>
              <Field label="Posting decimal places" name="posting_decimals" error={state?.fieldErrors?.posting_decimals}>
                <input id="posting_decimals" name="posting_decimals" type="number" min={0} max={4} className="field num"
                       defaultValue={settings.posting_decimals} disabled={disabled} />
              </Field>
              <Field label="Rounding rule" name="rounding">
                <select id="rounding" name="rounding" className="field" defaultValue={settings.rounding} disabled={disabled}>
                  <option value="NEAREST">Nearest</option>
                  <option value="UP">Up</option>
                  <option value="DOWN">Down</option>
                </select>
              </Field>
            </div>
          </Card>

          <Card title="Period" description="The reporting month drives the backcharge, the statements and the dayworks export.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Reporting month" name="report_month" error={state?.fieldErrors?.report_month}>
                <input id="report_month" name="report_month" type="month" className="field" required
                       defaultValue={settings.report_month.slice(0, 7)} disabled={disabled} />
              </Field>
              <Field label="First month of history" name="history_start" error={state?.fieldErrors?.history_start}>
                <input id="history_start" name="history_start" type="month" className="field" required
                       defaultValue={settings.history_start.slice(0, 7)} disabled={disabled} />
              </Field>
              <Field label="Period lock date" name="lock_date" error={state?.fieldErrors?.lock_date}
                     hint="Rows on or before this are flagged, never blocked">
                <input id="lock_date" name="lock_date" type="date" className="field"
                       defaultValue={settings.lock_date ?? ''} disabled={disabled} />
              </Field>
              <Field label="Financial year start month" name="fy_start_month">
                <input id="fy_start_month" name="fy_start_month" type="number" min={1} max={12} className="field num"
                       defaultValue={settings.fy_start_month} disabled={disabled} />
              </Field>
              <Field label="Maximum backdating (days)" name="max_backdating_days"
                     hint="Compared against the entry timestamp">
                <input id="max_backdating_days" name="max_backdating_days" type="number" min={0} max={365} className="field num"
                       defaultValue={settings.max_backdating_days} disabled={disabled} />
              </Field>
              <Field label="Reconciliation tolerance" name="tolerance"
                     hint="Differences strictly smaller than this are tolerated">
                <input id="tolerance" name="tolerance" type="number" min={0} step="0.000001" className="field num"
                       defaultValue={settings.tolerance} disabled={disabled} />
              </Field>
            </div>
          </Card>

          <Card title="Valuation and charging">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Valuation method" name="valuation"
                     hint="How a consumed cylinder is priced">
                <select id="valuation" name="valuation" className="field" defaultValue={settings.valuation} disabled={disabled}>
                  <option value="FIFO_MONTHLY">FIFO, one rate per month</option>
                  <option value="WAC">Weighted average cost</option>
                  <option value="STD">Standard rate</option>
                </select>
              </Field>
              <Field label="Charge trigger" name="trigger_rule"
                     hint="When the department is charged">
                <select id="trigger_rule" name="trigger_rule" className="field" defaultValue={settings.trigger_rule} disabled={disabled}>
                  <option value="ON_ISSUE">On issue</option>
                  <option value="ON_ISSUE_MONTH_END">On issue, priced at month end</option>
                  <option value="ON_RETURN">On return of the empty</option>
                </select>
              </Field>
              <Field label="Purchase VAT rate" name="purchase_vat_rate" error={state?.fieldErrors?.purchase_vat_rate}
                     hint="As a fraction, e.g. 0.05">
                <input id="purchase_vat_rate" name="purchase_vat_rate" type="number" min={0} max={1} step="0.0001"
                       className="field num" defaultValue={settings.purchase_vat_rate} disabled={disabled} />
              </Field>
              <Field label="Backcharge VAT rate" name="backcharge_vat_rate"
                     hint="Confirm the internal posting treatment with finance">
                <input id="backcharge_vat_rate" name="backcharge_vat_rate" type="number" min={0} max={1} step="0.0001"
                       className="field num" defaultValue={settings.backcharge_vat_rate} disabled={disabled} />
              </Field>
              <Field label="Backcharge uplift" name="backcharge_uplift"
                     hint="Applied to interdepartment charges only">
                <input id="backcharge_uplift" name="backcharge_uplift" type="number" min={0} max={1} step="0.0001"
                       className="field num" defaultValue={settings.backcharge_uplift} disabled={disabled} />
              </Field>
              <Field label="Delivery allocation" name="delivery_allocation"
                     hint="How a PO-wide charge is spread over its lines">
                <select id="delivery_allocation" name="delivery_allocation" className="field"
                        defaultValue={settings.delivery_allocation} disabled={disabled}>
                  <option value="PER_CYLINDER">Per cylinder received</option>
                  <option value="PER_LINE">Evenly per PO line</option>
                </select>
              </Field>
              <Field label="Current purchasing department" name="purchasing_department"
                     hint="Prefilled on new purchases">
                <select id="purchasing_department" name="purchasing_department" className="field"
                        defaultValue={settings.purchasing_department ?? ''} disabled={disabled}>
                  <option value="">—</option>
                  {departments.filter((d) => d.active).map((d) => (
                    <option key={d.code} value={d.code}>{d.code} · {d.full_name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Empty state while with a department" name="empty_state_policy"
                     hint="There is no consumption-status scan">
                <select id="empty_state_policy" name="empty_state_policy" className="field"
                        defaultValue={settings.empty_state_policy} disabled={disabled}>
                  <option value="ASSUME_ALL_OUT">Assume all out are empty</option>
                  <option value="IGNORE">Do not estimate</option>
                </select>
              </Field>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Toggle name="purchase_includes_vat" label="Purchase rates are entered gross"
                      hint="VAT is stripped from every cost input"
                      defaultChecked={settings.purchase_includes_vat} disabled={disabled} />
              <Toggle name="honour_po_link" label="Honour the source PO link"
                      hint="A named PO line uses its own rate and owner"
                      defaultChecked={settings.honour_po_link} disabled={disabled} />
              <Toggle name="allow_negative_stock" label="Allow negative physical stock"
                      hint="Negative cost layers always fail regardless"
                      defaultChecked={settings.allow_negative_stock} disabled={disabled} />
            </div>
          </Card>

          <Card title="Entry rules">
            <div className="grid gap-2 sm:grid-cols-2">
              <Toggle name="require_cost_code" label="Require a cost code on issue"
                      hint="Must belong to the receiving department"
                      defaultChecked={settings.require_cost_code} disabled={disabled} />
              <Toggle name="require_receiver" label="Require a named receiver"
                      hint="Must be active personnel in that department"
                      defaultChecked={settings.require_receiver} disabled={disabled} />
            </div>
          </Card>

          {editable && (
            <div className="flex justify-end">
              <Submit>Save settings</Submit>
            </div>
          )}
        </div>
      )}
    </ActionForm>
  );
}
