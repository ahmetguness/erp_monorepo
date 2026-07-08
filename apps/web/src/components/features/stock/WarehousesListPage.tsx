'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, Layers3, Plus, MapPin } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { ActiveBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { FormRow } from '@/components/shared/FormField';
import { useWarehouses, useCreateWarehouse } from '@/hooks/useStock';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import type { Warehouse } from '@/services/stock.service';

const warehouseSchema = z.object({
  code: z.string().min(1, 'Kod zorunludur'),
  name: z.string().min(1, 'Ad zorunludur'),
  address: z.string().optional(),
});
type WarehouseForm = z.infer<typeof warehouseSchema>;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value);
}

export function WarehousesListPage() {
  const router = useRouter();
  const { data: warehouses = [], isLoading } = useWarehouses();
  const createWarehouse = useCreateWarehouse();
  const [createOpen, setCreateOpen] = useState(false);
  const { multiWarehouse } = usePlanFeatures();

  // Starter: 1 depo limiti — zaten depo varsa "Yeni Depo" gösterme
  const canAddWarehouse = multiWarehouse || warehouses.length === 0;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<WarehouseForm>({
    resolver: zodResolver(warehouseSchema),
  });

  const onSubmit = (data: WarehouseForm) => {
    createWarehouse.mutate(data, { onSuccess: () => { setCreateOpen(false); reset(); } });
  };

  const columns: ColumnDef<Warehouse>[] = [
    {
      key: 'name', header: 'Depo',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-200">{r.name}</p>
          <p className="text-xs text-slate-500 font-mono">{r.code}</p>
        </div>
      ),
    },
    {
      key: 'address', header: 'Adres',
      render: (r) => r.address
        ? <span className="flex items-center gap-1.5 text-sm text-slate-400"><MapPin className="w-3.5 h-3.5" />{r.address}</span>
        : <span className="text-slate-600">—</span>,
    },
    {
      key: 'stockLevels', header: 'Stok Kalemi', width: '110px', align: 'right',
      render: (r) => <span className="text-slate-300">{r.insight?.stockItemCount ?? r._count?.stockLevels ?? 0}</span>,
    },
    {
      key: 'locations',
      header: 'Lokasyon',
      width: '120px',
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <Layers3 className="h-3.5 w-3.5 text-sky-400" />
          {r.insight?.locationCount ?? r.locations?.length ?? 0}
        </span>
      ),
    },
    {
      key: 'value',
      header: 'Stok Degeri',
      width: '130px',
      align: 'right',
      render: (r) => <span className="text-xs font-medium text-emerald-300">{formatCurrency(r.insight?.totalValue ?? 0)}</span>,
    },
    {
      key: 'approval',
      header: 'Transfer Onayi',
      width: '140px',
      render: (r) => r.insight?.approval.transferApprovalConfigured ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Hazir
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-300">
          <Clock className="h-3.5 w-3.5" />
          Akis yok
        </span>
      ),
    },
    {
      key: 'isActive', header: 'Durum', width: '80px', align: 'center',
      render: (r) => <ActiveBadge isActive={r.isActive} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Depolar"
        subtitle="Depo ve lokasyonlarınızı yönetin."
        action={canAddWarehouse ? <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>Yeni Depo</Button> : undefined}
      />

      <DataTable
        columns={columns}
        data={warehouses}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        onRowClick={(r) => router.push(`/dashboard/warehouses/${r.id}`)}
        emptyTitle="Henüz depo eklenmemiş"
      />

      <Modal
        isOpen={createOpen}
        onClose={() => { setCreateOpen(false); reset(); }}
        title="Yeni Depo"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setCreateOpen(false); reset(); }}>İptal</Button>
            <Button onClick={handleSubmit(onSubmit)} loading={createWarehouse.isPending}>Kaydet</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormRow cols={2}>
            <Input label="Kod" required placeholder="WH01" error={errors.code?.message} {...register('code')} />
            <Input label="Ad" required placeholder="Ana Depo" error={errors.name?.message} {...register('name')} />
          </FormRow>
          <Input label="Adres" placeholder="Depo adresi" {...register('address')} />
        </form>
      </Modal>
    </div>
  );
}
