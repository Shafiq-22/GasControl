'use client';

import { setUserRole } from '@/lib/actions';
import { ActionForm, Submit } from '@/components/form';
import { Badge } from '@/components/ui';
import type { Profile } from '@/lib/types';

export function RoleRow({
  person,
  editable,
  isSelf,
}: {
  person: Profile;
  editable: boolean;
  isSelf: boolean;
}) {
  return (
    <tr>
      <td>
        {person.email}
        {isSelf && <span className="ml-1.5" style={{ color: 'var(--text-soft)' }}>(you)</span>}
      </td>
      <td>{person.full_name ?? '—'}</td>
      <td>
        <Badge tone={person.role === 'admin' ? 'ok' : person.role === 'custodian' ? 'warn' : 'neutral'}>
          {person.role}
        </Badge>
      </td>
      {editable && (
        <td>
          <ActionForm action={setUserRole} className="flex items-center gap-2">
            {() => (
              <>
                <input type="hidden" name="id" value={person.id} />
                <select name="role" className="field w-32 py-1 text-xs" defaultValue={person.role}>
                  <option value="viewer">viewer</option>
                  <option value="custodian">custodian</option>
                  <option value="admin">admin</option>
                </select>
                <Submit className="btn px-2 py-1 text-xs">Set</Submit>
              </>
            )}
          </ActionForm>
        </td>
      )}
    </tr>
  );
}
