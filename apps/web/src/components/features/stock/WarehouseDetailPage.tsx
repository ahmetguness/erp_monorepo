'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, Clock, Layers3, MapPin, PackageSearch, Pencil, Plus, Warehouse as WarehouseIcon, WalletCards } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ActiveBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { FormRow } from '@/components/shared/FormField';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useWarehouse, useUpdateWarehouse, useLocations, useCreateLocation, useStockMovements } from '@/hooks/useStock';
import type { StockMovement, WarehouseLocation } from '@/services/stock.service';
import { cn } from '@/lib/utils';

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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function movementType(movement: StockMovement) {
  const map = {
    IN: { label: 'Giriş', className: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' },
    OUT: { label: 'Çıkış', className: 'text-red-300 bg-red-500/10 border-red-500/20' },
    TRANSFER: { label: 'Transfer', className: 'text-sky-300 bg-sky-500/10 border-sky-500/20' },
    ADJUSTMENT: { label: 'Düzeltme', className: 'text-slate-300 bg-slate-800/70 border-slate-700/70' },
    RETURN: { label: 'İade', className: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' },
    OPENING: { label: 'Açılış', className: 'text-slate-300 bg-slate-800/70 border-slate-700/70' },
  } satisfies Record<StockMovement['type'], { label: string; className: string }>;
  return map[movement.type];
}

function LocationTableSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, row) => (
        <tr key={row} className="border-b border-slate-800/45 last:border-0">
          {Array.from({ length: 6 }).map((_, col) => (
            <td key={col} className="px-4 py-3.5"><div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-800/80" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function WarehouseDetailPage({ id }: Props) {
  const { data: warehouse, isLoading } = useWarehouse(id);
  const updateWarehouse = useUpdateWarehouse(id);
  const { data: locations = [], isLoading: loadingLocations } = useLocations(id);
  const { data: movementsResponse, isLoading: loadingMovements } = useStockMovements({ warehouseId: id, limit: 5 });
  const createLocation = useCreateLocation(id);

  const [editOpen, setEditOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);

  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) });
  const locationForm = useForm<LocationForm>({ resolver: zodResolver(locationSchema) });

  const locationInsightById = useMemo(() => new Map((warehouse?.insight?.locations ?? []).map((item) => [item.id, item])), [warehouse]);
  const movements = movementsResponse?.data ?? [];
  const pendingTransfers = warehouse?.insight?.approval.pendingTransferApprovalCount ?? 0;

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

  if (isLoading) return <FullPageSpinner />;
  if (!warehouse) return <div className="text-sm text-slate-400">Depo bulunamadı.</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/dashboard/warehouses" className="transition-colors duration-150 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40">Depolar</Link>
        <span>/</span>
        <span className="text-slate-300">{warehouse.name}</span>
      </div>

      <div className="flex flex-col gap-4 border-b border-slate-800/80 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-sky-400"><WarehouseIcon className="h-4.5 w-4.5" /></span>
            <h1 className="text-xl font-semibold tracking-tight text-white">{warehouse.name}</h1>
            <ActiveBadge isActive={warehouse.isActive} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
            <span className="font-mono">{warehouse.code}</span>
            {warehouse.address && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{warehouse.address}</span>}
          </div>
        </div>
        <Button variant="secondary" leftIcon={<Pencil className="h-4 w-4" />} onClick={openEdit}>Düzenle</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Aktif Lokasyon', value: warehouse.insight?.locationCount ?? locations.length, icon: Layers3, iconClass: 'text-sky-400' },
          { label: 'Stok Kalemi', value: warehouse.insight?.stockItemCount ?? 0, icon: PackageSearch, iconClass: 'text-violet-300' },
          { label: 'Toplam Stok Değeri', value: formatCurrency(warehouse.insight?.totalValue ?? 0), icon: WalletCards, iconClass: 'text-emerald-300' },
          { label: 'Bekleyen Transfer', value: pendingTransfers, icon: pendingTransfers > 0 ? Clock : CheckCircle2, iconClass: pendingTransfers > 0 ? 'text-amber-300' : 'text-slate-500' },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="rounded-xl border border-slate-800/80 bg-slate-950/35 p-4">
              <div className="mb-2 flex items-center justify-between">
                <Icon className={cn('h-4 w-4', metric.iconClass)} />
              </div>
              <p className="text-xl font-semibold tabular-nums text-white">{metric.value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{metric.label}</p>
            </div>
          );
        })}
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Lokasyonlar</h2>
            <p className="mt-0.5 text-xs text-slate-500">{warehouse.insight?.locationCount ?? locations.length} aktif lokasyon</p>
          </div>
          <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setLocationOpen(true)}>Lokasyon Ekle</Button>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-900/95">
                <tr className="border-b border-slate-800/80">
                  {['Kod', 'Ad', 'Stok Kalemi', 'Miktar', 'Değer', 'Durum'].map((header, index) => (
                    <th key={header} className={cn('px-4 py-3 text-left text-[11px] font-semibold uppercase text-slate-500', [2, 3, 4].includes(index) && 'text-right', index === 5 && 'text-center')}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingLocations ? <LocationTableSkeleton /> : locations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center">
                      <p className="text-sm font-semibold text-slate-200">Bu depoda henüz lokasyon bulunmuyor.</p>
                      <div className="mt-4"><Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setLocationOpen(true)}>Lokasyon Ekle</Button></div>
                    </td>
                  </tr>
                ) : locations.map((location: WarehouseLocation) => {
                  const insight = locationInsightById.get(location.id);
                  return (
                    <tr key={location.id} className="border-b border-slate-800/45 transition-colors duration-150 last:border-b-0 hover:bg-sky-500/[0.035]">
                      <td className="px-4 py-3.5 font-mono font-medium text-sky-300">{location.code}</td>
                      <td className="px-4 py-3.5 text-slate-200">{location.name}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-slate-300">{insight?.stockItemCount ?? 0}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-slate-400">{formatQuantity(insight?.totalQuantity ?? 0)}</td>
                      <td className="px-4 py-3.5 text-right font-medium tabular-nums text-emerald-200">{formatCurrency(insight?.totalValue ?? 0)}</td>
                      <td className="px-4 py-3.5 text-center"><ActiveBadge isActive={location.isActive} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {(loadingMovements || movements.length > 0) && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Son Stok Hareketleri</h2>
            <Link href="/dashboard/stock/movements" className="inline-flex items-center gap-1 text-xs font-medium text-sky-300 transition-colors duration-150 hover:text-sky-200">
              Tüm hareketleri görüntüle <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-900/95">
                  <tr className="border-b border-slate-800/80">
                    {['Tarih', 'Ürün', 'Hareket', 'Kaynak/Hedef', 'Miktar'].map((header, index) => <th key={header} className={cn('px-4 py-3 text-left text-[11px] font-semibold uppercase text-slate-500', index === 4 && 'text-right')}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {loadingMovements ? <LocationTableSkeleton /> : movements.map((movement) => {
                    const type = movementType(movement);
                    const route = movement.type === 'TRANSFER'
                      ? `${movement.fromWarehouse?.name ?? '-'} -> ${movement.toWarehouse?.name ?? '-'}`
                      : movement.toWarehouse?.name ?? movement.fromWarehouse?.name ?? warehouse.name;
                    return (
                      <tr key={movement.id} className="border-b border-slate-800/45 last:border-b-0">
                        <td className="px-4 py-3.5 text-slate-400"><span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-slate-600" />{formatDate(movement.createdAt)}</span></td>
                        <td className="px-4 py-3.5"><p className="font-medium text-slate-200">{movement.product?.name ?? '-'}</p><p className="font-mono text-xs text-slate-500">{movement.product?.code ?? ''}</p></td>
                        <td className="px-4 py-3.5"><span className={cn('inline-flex rounded-md border px-2 py-1 text-xs font-medium', type.className)}>{type.label}</span></td>
                        <td className="px-4 py-3.5 text-slate-400">{route}</td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-slate-200">{formatQuantity(movement.quantity)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Depo Düzenle" size="sm" footer={<><Button variant="ghost" onClick={() => setEditOpen(false)}>İptal</Button><Button onClick={editForm.handleSubmit(onEditSubmit)} loading={updateWarehouse.isPending}>Kaydet</Button></>}>
        <form className="space-y-4">
          <Input label="Ad" required error={editForm.formState.errors.name?.message} {...editForm.register('name')} />
          <Input label="Adres" {...editForm.register('address')} />
        </form>
      </Modal>

      <Modal isOpen={locationOpen} onClose={() => { setLocationOpen(false); locationForm.reset(); }} title="Yeni Lokasyon" size="sm" footer={<><Button variant="ghost" onClick={() => { setLocationOpen(false); locationForm.reset(); }}>İptal</Button><Button onClick={locationForm.handleSubmit(onLocationSubmit)} loading={createLocation.isPending}>Kaydet</Button></>}>
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
