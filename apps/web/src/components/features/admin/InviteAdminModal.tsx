'use client';

import { useState } from 'react';
import type { AdminRoleKey, InviteAdminInput } from '@repo/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { AdminRoleSelector } from './AdminRoleSelector';
import { UserPlus, User, Mail, ShieldAlert, Sparkles, Clock, KeyRound } from 'lucide-react';

export function InviteAdminModal({
  isOpen,
  onClose,
  onSubmit,
  pending,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: InviteAdminInput) => void;
  pending: boolean;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<AdminRoleKey[]>(['READ_ONLY_AUDITOR']);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || roles.length === 0) return;
    onSubmit({ name: name.trim(), email: email.trim(), roles });
  };

  const handleClose = () => {
    if (pending) return;
    setName('');
    setEmail('');
    setRoles(['READ_ONLY_AUDITOR']);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Yeni Yönetici Davet Et"
      description="Platform yönetim paneline erişim için güvenli davet bağlantısı oluşturun."
      size="lg"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={pending}
          >
            Vazgeç
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={pending}
            disabled={pending || !name.trim() || !email.trim() || roles.length === 0}
            onClick={handleSubmit}
            leftIcon={<UserPlus className="h-4 w-4" />}
          >
            Davet Gönder
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name Input */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Ad Soyad <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
              <User className="h-4 w-4" />
            </div>
            <input
              type="text"
              required
              minLength={2}
              maxLength={100}
              placeholder="Örn: Ahmet Yılmaz"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              className="w-full rounded-xl border border-slate-800 bg-slate-900/80 py-2.5 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-sky-500 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Email Input */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            E-posta Adresi <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
              <Mail className="h-4 w-4" />
            </div>
            <input
              type="email"
              required
              placeholder="admin@sirket.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
              className="w-full rounded-xl border border-slate-800 bg-slate-900/80 py-2.5 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-sky-500 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Role Selector */}
        <AdminRoleSelector
          value={roles}
          onChange={setRoles}
          disabled={pending}
        />

        {/* Security Info Banner */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3.5 text-xs text-slate-300">
          <div className="flex items-start gap-2.5">
            <Clock className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-slate-200">
                Güvenlik Protokolü & Davet Süreci
              </p>
              <p className="text-slate-400">
                Davet bağlantısı <strong className="text-slate-200">24 saat</strong> boyunca geçerlidir.
                Yönetici ilk girişinde şifresini belirler ve <strong className="text-slate-200">MFA (İki Aşamalı Doğrulama)</strong> kurulumunu zorunlu olarak tamamlar.
              </p>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
