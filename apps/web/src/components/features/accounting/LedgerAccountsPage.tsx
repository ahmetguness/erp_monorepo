'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus, BookOpen, Hash, Type, GitBranch, Save, X,
  Landmark, CreditCard, PiggyBank, TrendingUp, TrendingDown,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { ActiveBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useLedgerAccounts, useCreateLedgerAccount } from '@/hooks/useAccounting';
import { cn } from '@/lib/utils';
import type { LedgerAccount, AccountType } from '@/services/accounting.service';

// ─────────────────────────────────────────────
// Account type config
// ─────────────────────────────────────────────

const ACCOUNT_TYPES = [
  { value: 'ASSET',     label: 'Varlık',      icon: Landmark,     color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     ring: 'ring-sky-500/20' },
  { value: 'LIABILITY', label: 'Yükümlülük',  icon: CreditCard,   color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     ring: 'ring-red-500/20' },
  { value: 'EQUITY',    label: 'Özkaynak',    icon: PiggyBank,    color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  ring: 'ring-violet-500/20' },
  { value: 'REVENUE',   label: 'Gelir',       icon: TrendingUp,   color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', ring: 'ring-emerald-500/20' },
  { value: 'EXPENSE',   label: 'Gider',       icon: TrendingDown, color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   ring: 'ring-amber-500/20' },
] as const;

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  ASSET: 'Varlık', LIABILITY: 'Yükümlülük', EQUITY: 'Özkaynak', REVENUE: 'Gelir', EXPENSE: 'Gider',
};

const TYPE_BADGE_COLORS: Record<AccountType, string> = {
  ASSET: 'bg-sky-500/10 text-sky-400',
  LIABILITY: 'bg-red-500/10 text-red-400',
  EQUITY: 'bg-violet-500/10 text-violet-400',
  REVENUE: 'bg-emerald-500/10 text-emerald-400',
  EXPENSE: 'bg-amber-500/10 text-amber-400',
};

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const schema = z.object({
  code: z.string().min(1, 'Kod zorunludur'),
  name: z.string().min(1, 'Ad zorunludur'),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  parentId: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function LedgerAccountsPage() {
  const { data: accounts = [], isLoading } = useLedgerAccounts();
  const createAccount = useCreateLedgerAccount();
  const [createOpen, setCreateOpen] = useState(false);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'ASSET' },
  });

  const selectedType = watch('type');

  const parentOptions = [
    { value: '', label: '— Üst hesap yok —' },
    ...accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
  ];

  const closeModal = () => { setCreateOpen(false); reset(); };

  const onSubmit = (data: FormData) => {
    createAccount.mutate(
      { code: data.code, name: data.name, type: data.type, parentId: data.parentId || undefined },
      { onSuccess: closeModal },
    );
  };

  const columns: ColumnDef<LedgerAccount>[] = [
    { key: 'code', header: 'Kod', width: '100px', render: (r) => <span className="font-mono text-sky-400">{r.code}</span> },
    { key: 'name', header: 'Ad', render: (r) => <span className="text-slate-200">{r.name}</span> },
    {
      key: 'accountType', header: 'Tip', width: '120px',
      render: (r) => (
        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', TYPE_BADGE_COLORS[r.accountType])}>
          {ACCOUNT_TYPE_LABELS[r.accountType]}
        </span>
      ),
    },
    { key: 'isActive', header: 'Durum', width: '80px', align: 'center', render: (r) => <ActiveBadge isActive={r.isActive} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Hesap Planı"
        subtitle="Muhasebe hesaplarını yönetin."
        action={
          <Link href="#" onClick={(e) => { e.preventDefault(); setCreateOpen(true); }}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white
                       bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500
                       shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30
                       transition-all duration-200 active:scale-[0.97]">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15 group-hover:bg-white/20 transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </span>
            Yeni Hesap
          </Link>
        }
      />
      <DataTable columns={columns} data={accounts} keyExtractor={(r) => r.id} isLoading={isLoading} emptyTitle="Hesap bulunamadı" />

      {/* ── New account modal ───────────────────── */}
      <Modal isOpen={createOpen} onClose={closeModal} title="Yeni Hesap Oluştur"
        description="Hesap planınıza yeni bir muhasebe hesabı ekleyin." size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" leftIcon={<X className="w-3.5 h-3.5" />} onClick={closeModal}>İptal</Button>
            <Button size="sm" loading={createAccount.isPending} leftIcon={<Save className="w-3.5 h-3.5" />}
              onClick={handleSubmit(onSubmit)}
              className="bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20">
              Hesabı Kaydet
            </Button>
          </>
        }
      >
        <form className="space-y-5">
          {/* ── Account type selector ──────────── */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 block">Hesap Tipi</label>
            <div className="grid grid-cols-5 gap-2">
              {ACCOUNT_TYPES.map((t) => {
                const Icon = t.icon;
                const active = selectedType === t.value;
                return (
                  <button key={t.value} type="button" onClick={() => setValue('type', t.value as FormData['type'])}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all duration-200',
                      active ? `${t.bg} ${t.border} ring-2 ${t.ring}` : 'border-slate-800 bg-slate-800/40 hover:border-slate-700 hover:bg-slate-800/70',
                    )}>
                    <Icon className={cn('w-4.5 h-4.5', active ? t.color : 'text-slate-500')} />
                    <span className={cn('text-[10px] font-medium', active ? t.color : 'text-slate-500')}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-slate-800" />

          {/* ── Code & Name ────────────────────── */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <BookOpen className="w-3 h-3" /> Hesap Bilgileri
            </label>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <Input label="Hesap Kodu" required placeholder="100" error={errors.code?.message}
                  prefixIcon={<Hash className="w-3.5 h-3.5" />} {...register('code')} />
                <div className="col-span-2">
                  <Input label="Hesap Adı" required placeholder="Kasa Hesabı" error={errors.name?.message}
                    prefixIcon={<Type className="w-3.5 h-3.5" />} {...register('name')} />
                </div>
              </div>
              <Select label="Üst Hesap" options={parentOptions}
                {...register('parentId')} />
              <p className="text-[10px] text-slate-600">Üst hesap seçerek hiyerarşik yapı oluşturabilirsiniz.</p>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
