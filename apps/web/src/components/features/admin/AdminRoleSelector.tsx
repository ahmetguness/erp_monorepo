'use client';

import { ADMIN_ROLE_KEYS, type AdminRoleKey } from '@repo/types';

export function AdminRoleSelector({ value, onChange, disabled = false }: {
  value: AdminRoleKey[]; onChange: (roles: AdminRoleKey[]) => void; disabled?: boolean;
}) {
  return <fieldset disabled={disabled} className="flex flex-wrap gap-3">
    <legend className="mb-2 text-sm text-slate-400">Roller</legend>
    {ADMIN_ROLE_KEYS.map((role) => <label key={role} className="flex items-center gap-2 text-xs">
      <input type="checkbox" checked={value.includes(role)} onChange={(event) => onChange(event.target.checked ? [...value, role] : value.filter((entry) => entry !== role))} />
      {role}
    </label>)}
  </fieldset>;
}
