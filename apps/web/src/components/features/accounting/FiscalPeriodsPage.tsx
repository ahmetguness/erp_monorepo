'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Lock } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { FiscalPeriodStatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { FormRow } from '@/components/shared/FormField';
import { useFiscalPeriods, useCreateFiscalPeriod, useCloseFiscalPeriod } from '@/hooks/useAccounting';
import { formatDate } from '@/lib/utils';
import type { FiscalPeriod } from '@/services/accounting.service';

const schema = z.object({
  name: z.string().min(1, 'Ad zorunludur'),
  startDate: z.string().min(1, 'Başlangıç tarihi zorunludur'),
  endDate: z.string().min(1, 'Bitiş tarihi zorunludur'),
});
type FormData = z.infer<typeof schema>;

export function FiscalPeriodsPage() {
  const { data: periods = [], isLoading } = useFiscalPeriods();
  const createPeriod = useCreateFiscalPeriod();
  const [createOpen, setCreateOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<FiscalPeriod | null>(null);
  const closePeriod = useCloseFiscalPeriod(closeTarget?.id ?? '');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = (data: FormData) => {
    createPeriod.mutate(data, { onSuccess: () => { setCreateOpen(false); reset(); } });
  };

  const columns: ColumnDef<FiscalPeriod>[] = [
    { key: 'name', header: 'Ad', render: (r) => <span className="text-slate-200 font-medium">{r.name}</span> },
    { key: 'startDate', header: 'Başlangıç', width: '120px', render: (r) => <span className="text-slate-400">{formatDate(r.startDate)}</span> },
    { key: 'endDate', header: 'Bitiş', width: '120px', render: (r) => <span className="text-slate-400">{formatDate(r.endDate)}</span> },
    { key: 'status', header: 'Durum', width: '100px', render: (r) => <FiscalPeriodStatusBadge status={r.status} /> },
    {
      key: 'actions', header: '', width: '80px', align: 'right',
      render: (r) => r.status === 'OPEN' ? (
        <button onClick={(e) => { e.stopPropagation(); setCloseTarget(r); }}
          className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors" aria-label="Kapat">
          <Lock className="w-3.5 h-3.5" />
        </button>
      ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Mali Dönemler"
        subtitle="Muhasebe dönemlerini yönetin."
        action={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>Yeni Dönem</Button>}
      />

      <DataTable columns={columns} data={periods} keyExtractor={(r) => r.id} isLoading={isLoading} emptyTitle="Mali dönem bulunamadı" />

      <Modal isOpen={createOpen} onClose={() => { setCreateOpen(false); reset(); }} title="Yeni Mali Dönem" size="sm"
        footer={<><Button variant="ghost" onClick={() => { setCreateOpen(false); reset(); }}>İptal</Button><Button onClick={handleSubmit(onSubmit)} loading={createPeriod.isPending}>Kaydet</Button></>}
      >
        <form className="space-y-4">
          <Input label="Ad" required placeholder="2026 Q1" error={errors.name?.message} {...register('name')} />
          <FormRow cols={2}>
            <Input label="Başlangıç" required type="date" error={errors.startDate?.message} {...register('startDate')} />
            <Input label="Bitiş" required type="date" error={errors.endDate?.message} {...register('endDate')} />
          </FormRow>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!closeTarget}
        onClose={() => setCloseTarget(null)}
        onConfirm={() => closePeriod.mutate(undefined, { onSuccess: () => setCloseTarget(null) })}
        title="Dönemi Kapat"
        message={`"${closeTarget?.name}" dönemini kapatmak istediğinize emin misiniz? Bu işlem geri alınamaz.`}
        confirmLabel="Kapat"
        isLoading={closePeriod.isPending}
        variant="warning"
      />
    </div>
  );
}
