'use client';

import { useState } from 'react';
import type { AdminRoleKey, AdminUserSummary, UpdateAdminInput } from '@repo/types';
import { AdminRoleSelector } from './AdminRoleSelector';

export function AdminUserEditor({ user, pending, onSave, onClose }: {
  user: AdminUserSummary; pending: boolean; onSave: (input: UpdateAdminInput) => void; onClose: () => void;
}) {
  const [roles, setRoles] = useState<AdminRoleKey[]>(user.roles);
  const [isActive, setIsActive] = useState(user.isActive);
  const invited = user.invitationStatus === 'PENDING' || user.invitationStatus === 'EXPIRED';
  return <form className="space-y-4 rounded-xl border border-blue-500/40 p-5" onSubmit={(event) => { event.preventDefault(); onSave({ roles, isActive }); }}>
    <h2 className="font-medium">{user.name} — Hesap düzenleme</h2>
    <AdminRoleSelector value={roles} onChange={setRoles} disabled={pending} />
    <label className="flex items-center gap-2"><input type="checkbox" checked={isActive} disabled={pending || invited} onChange={(event) => setIsActive(event.target.checked)} />Hesap aktif</label>
    <p className="text-sm text-slate-400">Değişiklik kaydedilince bu yöneticinin mevcut oturumları kapatılır. Son aktif Super Admin korunur.</p>
    <div className="flex gap-3"><button disabled={pending || roles.length === 0} className="rounded bg-blue-600 px-4 py-2 disabled:opacity-50">Kaydet</button><button type="button" disabled={pending} onClick={onClose}>Vazgeç</button></div>
  </form>;
}
