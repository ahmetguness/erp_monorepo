'use client';

import { useState } from 'react';
import type { AdminRoleKey, AdminUserSummary, UpdateAdminInput } from '@repo/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { AdminRoleSelector } from './AdminRoleSelector';
import { Shield, AlertTriangle, Lock, Unlock } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AdminUserEditor({
  user,
  pending,
  onSave,
  onClose,
}: {
  user: AdminUserSummary;
  pending: boolean;
  onSave: (input: UpdateAdminInput) => void;
  onClose: () => void;
}) {
  const [roles, setRoles] = useState<AdminRoleKey[]>(user.roles);
  const [isActive, setIsActive] = useState<boolean>(user.isActive);

  const isInvited = user.invitationStatus === 'PENDING' || user.invitationStatus === 'EXPIRED';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roles.length === 0) return;
    onSave({ roles, isActive });
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Yönetici Yetki ve Durumunu Düzenle"
      description="Yöneticinin atanmış rollerini ve hesap aktiflik durumunu güncelleyin."
      size="lg"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={pending}
          >
            Vazgeç
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={pending}
            disabled={pending || roles.length === 0}
            onClick={handleSubmit}
            leftIcon={<Shield className="h-4 w-4" />}
          >
            Değişiklikleri Kaydet
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* User Quick Info Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 text-sm font-bold text-white shadow-inner">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-100">{user.name}</span>
                {user.isActive ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Aktif
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                    Kilitli / Devre Dışı
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1">
              <Shield className={cn('h-3.5 w-3.5', user.mfaEnabled ? 'text-emerald-400' : 'text-amber-400')} />
              <span>{user.mfaEnabled ? 'MFA Aktif' : 'MFA Yok'}</span>
            </div>
            {user.activeSessionCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{user.activeSessionCount} Oturum</span>
              </div>
            )}
          </div>
        </div>

        {/* Account Status Switch */}
        <div className="rounded-xl border border-slate-800/90 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg border',
                  isActive
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-400',
                )}
              >
                {isActive ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </div>
              <div>
                <label
                  htmlFor="account-active-toggle"
                  className="cursor-pointer text-sm font-medium text-slate-200"
                >
                  Hesap Durumu: {isActive ? 'Aktif (Giriş Yapabilir)' : 'Kilitli (Erişim Engellendi)'}
                </label>
                <p className="text-xs text-slate-400">
                  {isInvited
                    ? 'Davet aşamasındaki kullanıcıların durumları davet kabul edilene kadar sabittir.'
                    : 'Hesap kilitlendiğinde yöneticinin oturumları anında sonlandırılır ve giriş yapamaz.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              id="account-active-toggle"
              role="switch"
              aria-checked={isActive}
              disabled={pending || isInvited}
              onClick={() => setIsActive(!isActive)}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500',
                isActive ? 'bg-emerald-500' : 'bg-slate-700',
                (pending || isInvited) && 'cursor-not-allowed opacity-50',
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                  isActive ? 'translate-x-5' : 'translate-x-0',
                )}
              />
            </button>
          </div>
        </div>

        {/* Roles Selector */}
        <AdminRoleSelector
          value={roles}
          onChange={setRoles}
          disabled={pending}
        />

        {/* Security Warning Notice */}
        <div className="flex gap-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 text-xs text-sky-300">
          <AlertTriangle className="h-4 w-4 shrink-0 text-sky-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-sky-200">Güvenlik ve Oturum Bildirimi</p>
            <p className="text-slate-300">
              Değişiklik kaydedildiğinde yöneticinin tüm mevcut aktif oturumları güvenlik amacıyla sonlandırılır.
              Sistemdeki son aktif Süper Yönetici kilitlenemez veya yetkisi kaldırılamaz.
            </p>
          </div>
        </div>
      </form>
    </Modal>
  );
}
