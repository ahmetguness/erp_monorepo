'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, Layers3, PackageSearch, Plus, Pencil, WalletCards } from 'lucide-react';
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
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useWarehouse, useUpdateWarehouse, useLocations, useCreateLocation } from '@/hooks/useStock';
import type { WarehouseLocation } from '@/services/stock.service';

const editSchema = z.object({
  name: z.string().min(1, 'Ad zorunludur'),
  address: z.string().optional(),
});
const locationSchema = z.object({
  code: z.string().min(1, 'Kod zorunludur'),
  name: z.string().min(1, 'Ad zorunludur'),
});

type EditForm = z.infer<typeof editSchema>;
type LocationForm = z.infer<typeof locationSchema>;

interface Props { id: string }

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value);
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(value);
}

export function WarehouseDetailPage({ id }: Props) {
  const router = useRouter();
  const { data: warehouse, isLoading } = useWarehouse(id);
  const updateWarehouse = useUpdateWarehouse(id);
  const { data: locations = [], isLoading: loadingLocations } = useLocations(id);
  const createLocation = useCreateLocation(id);

  const [editOpen, setEditOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);

  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) });
  const locationForm = useForm<LocationForm>({ resolver: zodResolver(locationSchema) });

  const openEdit = () => {
    if (warehouse) editForm.reset({ name: warehouse.name, address: warehouse.address ?? '' });
    setEditOpen(true);
  };

  const onEditSubmit = (data: EditForm) => {
    updateWarehouse.mutate(data, { onSuccess: () => setEditOpen(false) });
  };

  const onLocationSubmit = (data: LocationForm) => {
    createLocation.mutate(data, { onSuccess: () => { setLocationOpen(false); locationForm.reset(); } });
  };

  const locationColumns: ColumnDef<WarehouseLocation>[] = [
    { key: 'code', header: 'Kod', width: '100px', render: (r) => <span className="font-mono text-sky-400">{r.code}</span> },
    { key: 'name', header: 'Ad', render: (r) => <span className="text-slate-200">{r.name}</span> },
    {
      key: 'stockItemCount',
      header: 'Stok Kalemi',
      width: '110px',
      align: 'right',
      render: (r) => <span className="text-slate-300">{warehouse?.insight?.locations.find((item) => item.id === r.id)?.stockItemCount ?? 0}</span>,
    },
    {
      key: 'totalQuantity',
      header: 'Miktar',
      width: '110px',
      align: 'right',
      render: (r) => <span className="text-slate-400">{formatQuantity(warehouse?.insight?.locations.find((item) => item.id === r.id)?.totalQuantity ?? 0)}</span>,
    },
    {
      key: 'totalValue',
      header: 'Deger',
      width: '120px',
      align: 'right',
      render: (r) => <span className="text-emerald-300">{formatCurrency(warehouse?.insight?.locations.find((item) => item.id === r.id)?.totalValue ?? 0)}</span>,
    },
    { key: 'isActive', header: 'Durum', width: '80px', align: 'center', render: (r) => <ActiveBadge isActive={r.isActive} /> },
  ];

  if (isLoading) return <FullPageSpinner />;
  if (!warehouse) return <div className="text-slate-400 text-sm">Depo bulunamadı.</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={warehouse.name}
        subtitle={warehouse.code}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" leftIcon={<Pencil className="w-4 h-4" />} onClick={openEdit}>Düzenle</Button>
          </div>
        }
      />

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <ActiveBadge isActive={warehouse.isActive} />
        {warehouse.address && <p className="text-sm text-slate-400 mt-2">{warehouse.address}</p>}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <Layers3 className="mb-3 h-5 w-5 text-sky-400" />
          <p className="text-2xl font-semibold text-white">{warehouse.insight?.locationCount ?? locations.length}</p>
          <p className="text-xs text-slate-500">Aktif lokasyon</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <PackageSearch className="mb-3 h-5 w-5 text-violet-400" />
          <p className="text-2xl font-semibold text-white">{warehouse.insight?.stockItemCount ?? 0}</p>
          <p className="text-xs text-slate-500">Stok kalemi</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <WalletCards className="mb-3 h-5 w-5 text-emerald-400" />
          <p className="text-2xl font-semibold text-white">{formatCurrency(warehouse.insight?.totalValue ?? 0)}</p>
          <p className="text-xs text-slate-500">Depo bazli stok degeri</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          {warehouse.insight?.approval.transferApprovalConfigured ? (
            <CheckCircle2 className="mb-3 h-5 w-5 text-emerald-400" />
          ) : (
            <Clock className="mb-3 h-5 w-5 text-amber-400" />
          )}
          <p className="text-sm font-semibold text-white">
            {warehouse.insight?.approval.transferApprovalConfigured ? 'Transfer onayi hazir' : 'Transfer onay akisi yok'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {warehouse.insight?.approval.pendingTransferApprovalCount ?? 0} bekleyen onay
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">Lokasyonlar</h2>
          <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setLocationOpen(true)}>Lokasyon Ekle</Button>
        </div>
        <DataTable
          columns={locationColumns}
          data={locations}
          keyExtractor={(r) => r.id}
          isLoading={loadingLocations}
          emptyTitle="Henüz lokasyon eklenmemiş"
        />
      </div>

      {/* Edit Modal */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Depo Düzenle" size="sm"
        footer={<><Button variant="ghost" onClick={() => setEditOpen(false)}>İptal</Button><Button onClick={editForm.handleSubmit(onEditSubmit)} loading={updateWarehouse.isPending}>Kaydet</Button></>}
      >
        <form className="space-y-4">
          <Input label="Ad" required error={editForm.formState.errors.name?.message} {...editForm.register('name')} />
          <Input label="Adres" {...editForm.register('address')} />
        </form>
      </Modal>

      {/* Location Modal */}
      <Modal isOpen={locationOpen} onClose={() => { setLocationOpen(false); locationForm.reset(); }} title="Yeni Lokasyon" size="sm"
        footer={<><Button variant="ghost" onClick={() => { setLocationOpen(false); locationForm.reset(); }}>İptal</Button><Button onClick={locationForm.handleSubmit(onLocationSubmit)} loading={createLocation.isPending}>Kaydet</Button></>}
      >
        <form className="space-y-4">
          <FormRow cols={2}>
            <Input label="Kod" required placeholder="A-01" error={locationForm.formState.errors.code?.message} {...locationForm.register('code')} />
            <Input label="Ad" required placeholder="Raf A-01" error={locationForm.formState.errors.name?.message} {...locationForm.register('name')} />
          </FormRow>
        </form>
      </Modal>
    </div>
  );
}
