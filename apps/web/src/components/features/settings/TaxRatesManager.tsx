'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { FormRow } from '@/components/shared/FormField';
import { useTaxRates, useCreateTaxRate, useUpdateTaxRate } from '@/hooks/useMasterData';
import type { TaxRate } from '@/services/master-data.service';

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const taxRateSchema = z.object({
  name: z.string().min(1, 'Ad zorunludur'),
  rate: z.string().min(1, 'Oran zorunludur').refine(
    (v) => !isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100,
    'Geçerli bir oran girin (0-100)',
  ),
  isWithholding: z.boolean().optional(),
});

type TaxRateForm = z.infer<typeof taxRateSchema>;

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function TaxRatesManager() {
  const { data: taxRates = [], isLoading } = useTaxRates();
  const createTaxRate = useCreateTaxRate();
  const updateTaxRate = useUpdateTaxRate();

  const [modalState, setModalState] = useState<{ open: boolean; editing: TaxRate | null }>({
    open: false, editing: null,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<TaxRateForm>({
    resolver: zodResolver(taxRateSchema),
  });

  const openCreate = () => { reset({ name: '', rate: '', isWithholding: false }); setModalState({ open: true, editing: null }); };
  const openEdit = (t: TaxRate) => { reset({ name: t.name, rate: String(t.rate), isWithholding: !!t.isWithholding }); setModalState({ open: true, editing: t }); };
  const closeModal = () => { setModalState({ open: false, editing: null }); reset(); };

  const onSubmit = (data: TaxRateForm) => {
    const payload = { name: data.name, rate: Number(data.rate), isWithholding: !!data.isWithholding };
    if (modalState.editing) {
      updateTaxRate.mutate({ id: modalState.editing.id, data: payload }, { onSuccess: closeModal });
    } else {
      createTaxRate.mutate(payload, { onSuccess: closeModal });
    }
  };

  const columns: ColumnDef<TaxRate>[] = [
    { key: 'name', header: 'Ad', render: (r) => <span className="text-slate-200">{r.name}</span> },
    {
      key: 'isWithholding', header: 'Tür', width: '120px',
      render: (r) => <Badge variant={r.isWithholding ? 'warning' : 'info'}>{r.isWithholding ? 'Stopaj / Tevkifat' : 'KDV'}</Badge>,
    },
    {
      key: 'rate', header: 'Oran', width: '100px', align: 'right',
      render: (r) => <span className="font-mono text-sky-400">%{r.rate}</span>,
    },
    {
      key: 'isActive', header: 'Durum', width: '80px', align: 'center',
      render: (r) => <Badge variant={r.isActive ? 'success' : 'neutral'}>{r.isActive ? 'Aktif' : 'Pasif'}</Badge>,
    },
    {
      key: 'actions', header: '', width: '60px', align: 'right',
      render: (r) => (
        <button
          onClick={(e) => { e.stopPropagation(); openEdit(r); }}
          className="p-1.5 rounded-lg text-slate-500 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
          aria-label="Düzenle"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  const isPending = createTaxRate.isPending || updateTaxRate.isPending;

  return (
    <div>
      <PageHeader
        title="Vergi Oranları"
        subtitle="Fatura ve ürünlerde kullanılan vergi ve stopaj oranlarını yönetin."
        action={
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={openCreate}>
            Yeni Oran
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={taxRates}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Henüz vergi veya stopaj oranı eklenmemiş"
      />

      <Modal
        isOpen={modalState.open}
        onClose={closeModal}
        title={modalState.editing ? 'Vergi Oranı Düzenle' : 'Yeni Vergi Oranı'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>İptal</Button>
            <Button onClick={handleSubmit(onSubmit)} loading={isPending}>Kaydet</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormRow cols={2}>
            <Input label="Ad" required placeholder="KDV %18 veya Stopaj %2" error={errors.name?.message} {...register('name')} />
            <Input label="Oran (%)" required type="number" step="0.01" placeholder="18" error={errors.rate?.message} {...register('rate')} />
          </FormRow>
          <div className="flex items-center gap-2 pt-2">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-sky-500/30"
                {...register('isWithholding')}
              />
              Tevkifat / Stopaj oranı (KDV matrahından düşülür)
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
}
