'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, FilterX, MapPin, Plus, Search, Warehouse as WarehouseIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/shared/PageHeader';
import { ActiveBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { FormRow } from '@/components/shared/FormField';
import { useWarehouses, useCreateWarehouse } from '@/hooks/useStock';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import type { Warehouse } from '@/services/stock.service';
import { cn } from '@/lib/utils';

const warehouseSchema = z.object({
  code: z.string().min(1, 'Kod zorunludur'),
  name: z.string().min(1, 'Ad zorunludur'),
  address: z.string().optional(),
});

type WarehouseForm = z.infer<typeof warehouseSchema>;
type StatusFilter = 'all' | 'active' | 'inactive';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value);
}

function numberFormat(value: number): string {
  return new Intl.NumberFormat('tr-TR').format(value);
}

function approvalLabel(warehouse: Warehouse) {
  const pending = warehouse.insight?.approval.pendingTransferApprovalCount ?? 0;
  if (pending > 0) return { text: `${pending} bekliyor`, className: 'text-amber-300' };
  if (warehouse.insight?.approval.transferApprovalConfigured) return { text: 'Akış hazır', className: 'text-emerald-300' };
  return { text: '- Akış yok', className: 'text-slate-500' };
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, row) => (
        <tr key={row} className="border-b border-slate-800/50 last:border-0">
          {Array.from({ length: 8 }).map((_, col) => (
            <td key={col} className="px-4 py-4">
              <div className="h-3.5 animate-pulse rounded bg-slate-800/80" style={{ width: `${42 + ((row + col) % 3) * 18}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function WarehousesListPage() {
  const router = useRouter();
  const { data: warehouses = [], isLoading } = useWarehouses();
  const createWarehouse = useCreateWarehouse();
  const { multiWarehouse } = usePlanFeatures();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState('name');

  const canAddWarehouse = multiWarehouse || warehouses.length === 0;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<WarehouseForm>({
    resolver: zodResolver(warehouseSchema),
  });

  const summary = useMemo(() => ({
    total: warehouses.length,
    active: warehouses.filter((warehouse) => warehouse.isActive).length,
    locations: warehouses.reduce((sum, warehouse) => sum + (warehouse.insight?.locationCount ?? warehouse.locations?.length ?? 0), 0),
    stockItems: warehouses.reduce((sum, warehouse) => sum + (warehouse.insight?.stockItemCount ?? warehouse._count?.stockLevels ?? 0), 0),
    value: warehouses.reduce((sum, warehouse) => sum + (warehouse.insight?.totalValue ?? 0), 0),
  }), [warehouses]);

  const filteredWarehouses = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return warehouses
      .filter((warehouse) => {
        const matchesSearch = !q || [warehouse.name, warehouse.code, warehouse.address ?? ''].some((value) => value.toLocaleLowerCase('tr-TR').includes(q));
        const matchesStatus = status === 'all' || (status === 'active' ? warehouse.isActive : !warehouse.isActive);
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        if (sort === 'value') return (b.insight?.totalValue ?? 0) - (a.insight?.totalValue ?? 0);
        if (sort === 'locations') return (b.insight?.locationCount ?? 0) - (a.insight?.locationCount ?? 0);
        return a.name.localeCompare(b.name, 'tr-TR');
      });
  }, [warehouses, search, status, sort]);

  const clearFilters = () => {
    setSearch('');
    setStatus('all');
    setSort('name');
  };

  const onSubmit = (data: WarehouseForm) => {
    createWarehouse.mutate(data, { onSuccess: () => { setCreateOpen(false); reset(); } });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Depolar"
        subtitle="Depo ve lokasyonlarınızı yönetin."
        action={canAddWarehouse ? <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Yeni Depo</Button> : undefined}
        className="mb-0"
      />

      <div className="flex flex-col gap-3 rounded-xl border border-slate-800/80 bg-slate-950/35 p-3 lg:flex-row lg:items-center">
        <div className="min-w-[240px] flex-1">
          <Input aria-label="Depo ara" placeholder="Depo adı, kod veya adres ara" value={search} onChange={(event) => setSearch(event.target.value)} prefixIcon={<Search className="h-4 w-4" />} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'active', 'inactive'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStatus(item)}
              className={cn(
                'h-9 rounded-lg border px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40',
                status === item ? 'border-sky-500/50 bg-sky-500/10 text-sky-200' : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-200',
              )}
            >
              {item === 'all' ? 'Tümü' : item === 'active' ? 'Aktif' : 'Pasif'}
            </button>
          ))}
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-9 rounded-lg border border-slate-800 bg-slate-950/40 px-3 text-xs font-medium text-slate-300 outline-none transition-colors duration-150 hover:border-slate-700 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/30">
            <option value="name">Ada göre</option>
            <option value="value">Stok değerine göre</option>
            <option value="locations">Lokasyona göre</option>
          </select>
        </div>
      </div>

      <div className="grid rounded-xl border border-slate-800/80 bg-slate-950/35 sm:grid-cols-5">
        {[
          ['Toplam Depo', numberFormat(summary.total)],
          ['Aktif Depo', numberFormat(summary.active)],
          ['Lokasyon', numberFormat(summary.locations)],
          ['Stok Kalemi', numberFormat(summary.stockItems)],
          ['Stok Değeri', formatCurrency(summary.value)],
        ].map(([label, value]) => (
          <div key={label} className="border-b border-slate-800/70 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
            <p className="text-base font-semibold tabular-nums text-slate-100">{value}</p>
            <p className="mt-0.5 text-[11px] font-medium uppercase text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-900/95">
              <tr className="border-b border-slate-800/80">
                {['Depo', 'Adres', 'Stok Kalemi', 'Lokasyon', 'Stok Değeri', 'Transfer Onayı', 'Durum', ''].map((header, index) => (
                  <th key={header || index} className={cn('px-4 py-3 text-left text-[11px] font-semibold uppercase text-slate-500', [2, 3, 4].includes(index) && 'text-right', index === 6 && 'text-center')} >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? <TableSkeleton /> : filteredWarehouses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <p className="text-sm font-semibold text-slate-200">{warehouses.length === 0 ? 'Henüz depo bulunmuyor' : 'Aramanızla eşleşen depo bulunamadı.'}</p>
                    <p className="mt-1 text-sm text-slate-500">{warehouses.length === 0 ? 'Stok ve lokasyon yönetimine başlamak için ilk deponuzu oluşturun.' : 'Filtreleri temizleyerek tüm depoları yeniden görüntüleyin.'}</p>
                    <div className="mt-4 flex justify-center">
                      {warehouses.length === 0 && canAddWarehouse ? (
                        <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateOpen(true)}>İlk Depoyu Oluştur</Button>
                      ) : (
                        <Button size="sm" variant="secondary" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Filtreleri Temizle</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : filteredWarehouses.map((warehouse) => {
                const approval = approvalLabel(warehouse);
                return (
                  <tr
                    key={warehouse.id}
                    tabIndex={0}
                    onClick={() => router.push(`/dashboard/warehouses/${warehouse.id}`)}
                    onKeyDown={(event) => { if (event.key === 'Enter') router.push(`/dashboard/warehouses/${warehouse.id}`); }}
                    className="group cursor-pointer border-b border-slate-800/45 transition-colors duration-150 last:border-b-0 hover:bg-sky-500/[0.045] focus-visible:bg-sky-500/[0.06] focus-visible:outline-none"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-sky-400"><WarehouseIcon className="h-4 w-4" /></span>
                        <div>
                          <p className="font-medium text-slate-100">{warehouse.name}</p>
                          <p className="font-mono text-xs text-slate-500">{warehouse.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[260px] px-4 py-3.5 text-slate-400">
                      {warehouse.address ? <span className="flex items-center gap-1.5 truncate"><MapPin className="h-3.5 w-3.5 shrink-0 text-slate-600" />{warehouse.address}</span> : <span className="text-slate-600">-</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium tabular-nums text-slate-200">{numberFormat(warehouse.insight?.stockItemCount ?? warehouse._count?.stockLevels ?? 0)}</td>
                    <td className="px-4 py-3.5 text-right font-medium tabular-nums text-slate-300">{numberFormat(warehouse.insight?.locationCount ?? warehouse.locations?.length ?? 0)}</td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-emerald-200">{formatCurrency(warehouse.insight?.totalValue ?? 0)}</td>
                    <td className={cn('px-4 py-3.5 text-xs font-medium', approval.className)}>{approval.text}</td>
                    <td className="px-4 py-3.5 text-center"><ActiveBadge isActive={warehouse.isActive} /></td>
                    <td className="w-10 px-4 py-3.5 text-right"><ChevronRight className="h-4 w-4 text-slate-600 opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={createOpen} onClose={() => { setCreateOpen(false); reset(); }} title="Yeni Depo" size="sm" footer={<><Button variant="ghost" onClick={() => { setCreateOpen(false); reset(); }}>İptal</Button><Button onClick={handleSubmit(onSubmit)} loading={createWarehouse.isPending}>Kaydet</Button></>}>
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
