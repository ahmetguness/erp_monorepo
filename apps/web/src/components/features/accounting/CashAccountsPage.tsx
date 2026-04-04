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
import { FormRow } from '@/components/shared/FormField';
import { useCashAccounts, useCreateCashAccount } from '@/hooks/useAccounting';
import type { CashAccount } from '@/services/accounting.service';

const schema = z.object({
  name: z.string().min(1, 'Ad zorunludur'),
  currencyCode: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export function CashAccountsPage() {
  const { data: accounts = [], isLoading } = useCashAccounts();
  const createAccount = useCreateCashAccount();
  const [createOpen, setCreateOpen] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { currencyCode: 'TRY' },
  });

  const onSubmit = (data: FormData) => {
    createAccount.mutate(data, { onSuccess: () => { setCreateOpen(false); reset(); } });
  };

  const columns: ColumnDef<CashAccount>[] = [
    { key: 'name', header: 'Ad', render: (r) => <span className="text-slate-200 font-medium">{r.name}</span> },
    { key: 'currencyCode', header: 'Para Birimi', width: '120px', render: (r) => <span className="text-slate-400">{r.currencyCode}</span> },
    { key: 'isActive', header: 'Durum', width: '80px', align: 'center', render: (r) => <ActiveBadge isActive={r.isActive} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Kasa Hesapları"
        subtitle="Nakit kasa hesaplarınızı yönetin."
        action={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>Yeni Kasa</Button>}
      />
      <DataTable columns={columns} data={accounts} keyExtractor={(r) => r.id} isLoading={isLoading} emptyTitle="Kasa hesabı bulunamadı" />
      <Modal isOpen={createOpen} onClose={() => { setCreateOpen(false); reset(); }} title="Yeni Kasa Hesabı" size="sm"
        footer={<><Button variant="ghost" onClick={() => { setCreateOpen(false); reset(); }}>İptal</Button><Button onClick={handleSubmit(onSubmit)} loading={createAccount.isPending}>Kaydet</Button></>}
      >
        <form className="space-y-4">
          <FormRow cols={2}>
            <Input label="Kasa Adı" required placeholder="Ana Kasa" error={errors.name?.message} {...register('name')} />
            <Input label="Para Birimi" placeholder="TRY" {...register('currencyCode')} />
          </FormRow>
        </form>
      </Modal>
    </div>
  );
}
