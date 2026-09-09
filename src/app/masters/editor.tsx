'use client';

import { useState } from 'react';
import { saveMasterRow } from '@/lib/actions';
import { ActionForm, Submit } from '@/components/form';
import { Badge, Card } from '@/components/ui';

export interface Column {
  name: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'number';
  step?: string;
  options?: string[];
  width?: string;
}

/** Any master record. The editor reads its columns by name. */
interface Row { active: boolean }

const field = (row: Row, name: string): unknown => (row as unknown as Record<string, unknown>)[name];

/**
 * A master table with an inline "add or update" row. Saving upserts on the
 * key column, so editing an existing record is the same action as adding a
 * new one — which is how a spreadsheet behaves and what users expect here.
 */
export function MasterEditor({
  table,
  title,
  description,
  rows,
  columns,
  keyField,
  editable,
}: {
  table: string;
  title: string;
  description?: string;
  rows: readonly Row[];
  columns: Column[];
  keyField: string;
  editable: boolean;
}) {
  const [draft, setDraft] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);

  const startEdit = (row: Row) => {
    setDraft(row);
    setOpen(true);
  };

  return (
    <Card
      title={title}
      description={description}
      actions={
        editable && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDraft(null);
              setOpen((v) => !v || draft !== null);
            }}
          >
            {open && draft === null ? 'Close' : 'Add row'}
          </button>
        )
      }
      bodyClassName="p-0"
    >
      {editable && open && (
        <div className="border-b p-4" style={{ borderColor: 'var(--line)', background: 'var(--canvas)' }}>
          <ActionForm action={saveMasterRow} resetOnSuccess key={draft ? String(field(draft, keyField)) : 'new'}>
            {(state) => (
              <>
                <input type="hidden" name="__table" value={table} />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {columns.map((column) => (
                    <div key={column.name}>
                      <label className="label" htmlFor={`${table}-${column.name}`}>
                        {column.label}{column.required ? '' : ' (optional)'}
                      </label>
                      {column.options ? (
                        <select
                          id={`${table}-${column.name}`}
                          name={column.name}
                          className="field"
                          required={column.required}
                          defaultValue={draft ? String(field(draft, column.name) ?? '') : ''}
                        >
                          <option value="" disabled={column.required}>—</option>
                          {column.options.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={`${table}-${column.name}`}
                          name={column.name}
                          className="field"
                          type={column.type ?? 'text'}
                          step={column.step}
                          required={column.required}
                          readOnly={column.name === keyField && draft !== null}
                          defaultValue={draft ? String(field(draft, column.name) ?? '') : ''}
                        />
                      )}
                      {state?.fieldErrors?.[column.name] && (
                        <p className="mt-1 text-xs" style={{ color: 'var(--fail-fg)' }}>
                          {state.fieldErrors[column.name]}
                        </p>
                      )}
                    </div>
                  ))}
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 pb-2 text-sm">
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={draft ? Boolean(draft.active) : true}
                      />
                      Active
                    </label>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Submit>{draft ? 'Update' : 'Add'}</Submit>
                  <button type="button" className="btn" onClick={() => { setDraft(null); setOpen(false); }}>
                    Cancel
                  </button>
                  <p className="ml-auto text-xs" style={{ color: 'var(--text-soft)' }}>
                    Deactivate rather than delete: history keeps referring to old codes.
                  </p>
                </div>
              </>
            )}
          </ActionForm>
        </div>
      )}

      <div className="scroll-x p-4 pt-3">
        <table className="ledger">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.name} className={column.type === 'number' ? 'num' : ''}>
                  {column.label}
                </th>
              ))}
              <th>Status</th>
              {editable && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(field(row, keyField))}>
                {columns.map((column) => (
                  <td key={column.name} className={column.type === 'number' ? 'num' : ''}>
                    {field(row, column.name) === null || field(row, column.name) === ''
                      ? '—'
                      : String(field(row, column.name))}
                  </td>
                ))}
                <td>
                  <Badge tone={row.active ? 'ok' : 'neutral'}>{row.active ? 'Active' : 'Inactive'}</Badge>
                </td>
                {editable && (
                  <td>
                    <button type="button" className="text-xs underline" onClick={() => startEdit(row)}>
                      Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (editable ? 2 : 1)} style={{ color: 'var(--text-soft)' }}>
                  Nothing here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
