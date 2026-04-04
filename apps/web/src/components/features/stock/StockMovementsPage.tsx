'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { FormRow } from '@/components/shared/FormField';
import { useStockMovements, useCreateManualMovement, useWarehouses } from '@/hooks/useStock';
import { formatDate } from '@/lib/utils';
import type { StockMovement, StockMovementType } from '@/services/stock.service';

const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  IN: 'Giriş', OUT: 'Çıkış', TRANSFER: 'Transfer',
  ADJUSTMENT: 'Düzeltme', RETURN: 'İade', OPENING: 'Açılış',
};

const MOVEMENT_TYPE_COLORS: Record<StockMovementType, string> = {
  IN: 'text-emerald-400', OUT: 'text-red-400', TRANSFER: 'text-sky-400',
  ADJUSTMENT: 'text-amber-400', RETURN: 'text-violet-400', OPENING: 'text-slate-400',
};

const manualMovementSchema = z.object({
  productId: z.string().min(1, 'Ürün ID zorunludur'),
  type: z.enum(['IN', 'OUT', 'ADJUSTMENT', 'OPENING']),
  quantity: z.string().min(1, 'Miktar zorunludur'),
  warehouseId: z.string().min(1, 'Depo seçiniz'),
  unitCost: z.string().optional(),
  notes: z.string().optional(),
});
type ManualMovementForm = z.infer<typeof manualMovementSchema>;

const MANUAL_TYPE_OPTIONS = [
  { value: 'IN', label: 'Giriş' },
  { value: 'OUT', label: 'Çıkış' },
  { value: 'ADJUSTMENT', label: 'Düzeltme' },
  { value: 'OPENING', label: 'Açılış' },
];

export function StockMovementsPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: warehouses = [] } = useWarehouses();
  const { data, isLoading } = useStockMovements({ page, limit: 20 });
  const createMovement = useCreateManualMovement();

  const warehouseOptions = warehouses.map((w) => ({ value: w.id, label: w.name }));

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ManualMovementForm>({
    resolver: zodResolver(manualMovementSchema),
    defaultValues: { type: 'IN' },
  });

  const onSubmit = (data: ManualMovementForm) => {
    createMovement.mutate(
      { ...data, quantity: Number(data.quantity), unitCost: data.unitCost ? Number(data.unitCost) : undefined },
      { onSuccess: () => { setCreateOpen(false); reset(); } },
    );
  };

  const columns: ColumnDef<StockMovement>[] = [
    { key: 'date', header: 'Tarih', width: '110px', render: (r) => <span className="text-slate-400">{formatDate(r.createdAt)}</span> },
    {
      key: 'type', header: 'Tip', width: '100px',
      render: (r) => <span className={`text-sm font-medium ${MOVEMENT_TYPE_COLORS[r.type]}`}>{MOVEMENT_TYPE_LABELS[r.type]}</span>,
    },
    {
      key: 'product', header: 'Ürün',
      render: (r) => (
        <div>
          <p className="text-slate-200">{r.product?.name ?? '—'}</p>
          <p className="text-xs text-slate-500 font-mono">{r.product?.code}</p>
        </div>
      ),
    },
    {
      key: 'warehouse', header: 'Depo',
      render: (r) => (
        <span className="text-sm text-slate-400">
          {r.fromWarehouse?.name ?? r.toWarehouse?.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'quantity', header: 'Miktar', width: '100px', align: 'right',
      render: (r) => <span className="font-medium text-slate-200">{Number(r.quantity).toFixed(3)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Stok Hareketleri"
        subtitle="Tüm stok giriş, çıkış ve transfer hareketleri."
        action={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>Manuel Hareket</Button>}
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Stok hareketi bulunamadı"
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />

      <Modal isOpen={createOpen} onClose={() => { setCreateOpen(false); reset(); }} title="Manuel Stok Hareketi" size="sm"
        footer={<><Button variant="ghost" onClick={() => { setCreateOpen(false); reset(); }}>İptal</Button><Button onClick={handleSubmit(onSubmit)} loading={createMovement.isPending}>Kaydet</Button></>}
      >
        <form className="space-y-4">
          <Input label="Ürün ID" required placeholder="Ürün ID'sini girin" error={errors.productId?.message} {...register('productId')} />
          <FormRow cols={2}>
            <Select label="Tip" required options={MANUAL_TYPE_OPTIONS} error={errors.type?.message} {...register('type')} />
            <Select label="Depo" required options={warehouseOptions} placeholder="Depo seçin" error={errors.warehouseId?.message} {...register('warehouseId')} />
          </FormRow>
          <FormRow cols={2}>
            <Input label="Miktar" required type="number" step="0.001" placeholder="0.000" error={errors.quantity?.message} {...register('quantity')} />
            <Input label="Birim Maliyet" type="number" step="0.01" placeholder="0.00" {...register('unitCost')} />
          </FormRow>
          <Input label="Notlar" placeholder="Açıklama…" {...register('notes')} />
        </form>
      </Modal>
    </div>
  );
}
