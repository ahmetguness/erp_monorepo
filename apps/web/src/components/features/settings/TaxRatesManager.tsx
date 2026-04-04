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

  const openCreate = () => { reset({ name: '', rate: '' }); setModalState({ open: true, editing: null }); };
  const openEdit = (t: TaxRate) => { reset({ name: t.name, rate: String(t.rate) }); setModalState({ open: true, editing: t }); };
  const closeModal = () => { setModalState({ open: false, editing: null }); reset(); };

  const onSubmit = (data: TaxRateForm) => {
    const payload = { name: data.name, rate: Number(data.rate) };
    if (modalState.editing) {
      updateTaxRate.mutate({ id: modalState.editing.id, data: payload }, { onSuccess: closeModal });
    } else {
      createTaxRate.mutate(payload, { onSuccess: closeModal });
    }
  };

  const columns: ColumnDef<TaxRate>[] = [
    { key: 'name', header: 'Ad', render: (r) => <span className="text-slate-200">{r.name}</span> },
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
        title="KDV Oranları"
        subtitle="Fatura ve ürünlerde kullanılan vergi oranlarını yönetin."
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
        emptyTitle="Henüz KDV oranı eklenmemiş"
      />

      <Modal
        isOpen={modalState.open}
        onClose={closeModal}
        title={modalState.editing ? 'KDV Oranı Düzenle' : 'Yeni KDV Oranı'}
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
            <Input label="Ad" required placeholder="KDV %18" error={errors.name?.message} {...register('name')} />
            <Input label="Oran (%)" required type="number" step="0.01" placeholder="18" error={errors.rate?.message} {...register('rate')} />
          </FormRow>
        </form>
      </Modal>
    </div>
  );
}
