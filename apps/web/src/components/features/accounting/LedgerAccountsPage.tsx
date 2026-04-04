'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { ActiveBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { FormRow } from '@/components/shared/FormField';
import { useLedgerAccounts, useCreateLedgerAccount } from '@/hooks/useAccounting';
import type { LedgerAccount, AccountType } from '@/services/accounting.service';

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'ASSET', label: 'Varlık' },
  { value: 'LIABILITY', label: 'Yükümlülük' },
  { value: 'EQUITY', label: 'Özkaynak' },
  { value: 'REVENUE', label: 'Gelir' },
  { value: 'EXPENSE', label: 'Gider' },
];

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  ASSET: 'Varlık', LIABILITY: 'Yükümlülük', EQUITY: 'Özkaynak', REVENUE: 'Gelir', EXPENSE: 'Gider',
};

const schema = z.object({
  code: z.string().min(1, 'Kod zorunludur'),
  name: z.string().min(1, 'Ad zorunludur'),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  parentId: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export function LedgerAccountsPage() {
  const { data: accounts = [], isLoading } = useLedgerAccounts();
  const createAccount = useCreateLedgerAccount();
  const [createOpen, setCreateOpen] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'ASSET' },
  });

  const parentOptions = [
    { value: '', label: '— Üst hesap yok —' },
    ...accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
  ];

  const onSubmit = (data: FormData) => {
    createAccount.mutate(
      { code: data.code, name: data.name, type: data.type, parentId: data.parentId || undefined },
      { onSuccess: () => { setCreateOpen(false); reset(); } },
    );
  };

  const columns: ColumnDef<LedgerAccount>[] = [
    { key: 'code', header: 'Kod', width: '100px', render: (r) => <span className="font-mono text-sky-400">{r.code}</span> },
    { key: 'name', header: 'Ad', render: (r) => <span className="text-slate-200">{r.name}</span> },
    { key: 'accountType', header: 'Tip', width: '110px', render: (r) => <span className="text-slate-400 text-sm">{ACCOUNT_TYPE_LABELS[r.accountType]}</span> },
    { key: 'isActive', header: 'Durum', width: '80px', align: 'center', render: (r) => <ActiveBadge isActive={r.isActive} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Hesap Planı"
        subtitle="Muhasebe hesaplarını yönetin."
        action={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>Yeni Hesap</Button>}
      />
      <DataTable columns={columns} data={accounts} keyExtractor={(r) => r.id} isLoading={isLoading} emptyTitle="Hesap bulunamadı" />
      <Modal isOpen={createOpen} onClose={() => { setCreateOpen(false); reset(); }} title="Yeni Hesap" size="sm"
        footer={<><Button variant="ghost" onClick={() => { setCreateOpen(false); reset(); }}>İptal</Button><Button onClick={handleSubmit(onSubmit)} loading={createAccount.isPending}>Kaydet</Button></>}
      >
        <form className="space-y-4">
          <FormRow cols={2}>
            <Input label="Kod" required placeholder="100" error={errors.code?.message} {...register('code')} />
            <Select label="Tip" required options={ACCOUNT_TYPE_OPTIONS} error={errors.type?.message} {...register('type')} />
          </FormRow>
          <Input label="Ad" required placeholder="Kasa" error={errors.name?.message} {...register('name')} />
          <Select label="Üst Hesap" options={parentOptions} {...register('parentId')} />
        </form>
      </Modal>
    </div>
  );
}
