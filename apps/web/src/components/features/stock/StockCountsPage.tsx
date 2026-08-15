'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowRight, CheckCircle2, ChevronRight, ClipboardCheck, FilterX, Hash,
  Package, Plus, Save, Search, Warehouse as WarehouseIcon, X,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { WarehouseSelect } from '@/components/shared/EntitySelect';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { Modal } from '@/components/ui/Modal';
import { useStockCounts, useCreateStockCount, useStockLevels } from '@/hooks/useStock';
import { cn, formatDate } from '@/lib/utils';
import type { StockCount } from '@/services/stock.service';

type StatusFilter = 'all' | 'active' | 'finalized';
type DatePreset = 'all' | '30d' | 'month';

const countItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  productCode: z.string(),
  expectedQty: z.number(),
  countedQty: z.string(),
});

const newCountSchema = z.object({
  warehouseId: z.string().min(1, 'Depo seçiniz'),
  date: z.string().min(1, 'Tarih zorunlu'),
  notes: z.string().optional(),
  items: z.array(countItemSchema).min(1, 'En az bir kalem olmalı'),
});

type NewCountForm = z.infer<typeof newCountSchema>;

function numberFormat(value: number): string {
  return new Intl.NumberFormat('tr-TR').format(value);
}

function formatQty(value: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(value);
}

function isThisMonth(value: string): boolean {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function matchesDatePreset(count: StockCount, preset: DatePreset): boolean {
  if (preset === 'all') return true;
  if (preset === 'month') return isThisMonth(count.date);
  const date = new Date(count.date);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  return date >= cutoff;
}

function StatusBadge({ finalized }: { finalized: boolean }) {
  return finalized
    ? <Badge variant="success">Tamamlandı</Badge>
    : <Badge variant="warning">Devam Ediyor</Badge>;
}

function SummarySkeleton() {
  return (
    <div className="grid rounded-xl border border-slate-800/80 bg-slate-950/35 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="border-b border-slate-800/70 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
          <div className="h-5 w-12 animate-pulse rounded bg-slate-800/80" />
          <div className="mt-2 h-3 w-24 animate-pulse rounded bg-slate-800/60" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, row) => (
        <tr key={row} className="border-b border-slate-800/45 last:border-0">
          {Array.from({ length: 7 }).map((__, col) => (
            <td key={col} className="px-4 py-3.5">
              <div className="h-3.5 animate-pulse rounded bg-slate-800/75" style={{ width: `${42 + ((row + col) % 3) * 18}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function StockCountsPage() {
  const router = useRouter();
  const { data: counts = [], isLoading } = useStockCounts();
  const createCount = useCreateStockCount();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const today = new Date().toISOString().split('T')[0];

  const { register, handleSubmit, control, reset, setValue, formState: { errors } } = useForm<NewCountForm>({
    resolver: zodResolver(newCountSchema),
    defaultValues: { warehouseId: '', date: today, notes: '', items: [] },
  });

  const { fields } = useFieldArray({ control, name: 'items' });
  const watchWarehouse = useWatch({ control, name: 'warehouseId' });
  const watchDate = useWatch({ control, name: 'date' });
  const watchedItems = useWatch({ control, name: 'items' }) ?? [];
  const selectedWarehouse = watchWarehouse ?? '';
  const { data: levels = [] } = useStockLevels({ warehouseId: selectedWarehouse || undefined });

  useEffect(() => {
    if (levels.length > 0 && selectedWarehouse) {
      setValue('items', levels.map((sl) => ({
        productId: sl.productId,
        productName: sl.product?.name ?? '-',
        productCode: sl.product?.code ?? '',
        expectedQty: Number(sl.quantity),
        countedQty: '0',
      })));
      return;
    }
    if (selectedWarehouse) setValue('items', []);
  }, [levels, selectedWarehouse, setValue]);

  const activeCounts = useMemo(() => counts.filter((count) => !count.isFinalized), [counts]);
  const historyCounts = useMemo(() => counts.filter((count) => count.isFinalized), [counts]);
  const summary = useMemo(() => ({
    active: activeCounts.length,
    finalized: historyCounts.length,
    totalItems: counts.reduce((sum, count) => sum + (count._count?.items ?? 0), 0),
    thisMonth: counts.filter((count) => isThisMonth(count.date)).length,
  }), [activeCounts.length, counts, historyCounts.length]);

  const filteredCounts = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return counts.filter((count) => {
      const matchesSearch = !q || count.number.toLocaleLowerCase('tr-TR').includes(q);
      const matchesWarehouse = !warehouseId || count.warehouseId === warehouseId;
      const matchesStatus = status === 'all' || (status === 'finalized' ? count.isFinalized : !count.isFinalized);
      return matchesSearch && matchesWarehouse && matchesStatus && matchesDatePreset(count, datePreset);
    });
  }, [counts, datePreset, search, status, warehouseId]);

  const hasFilters = Boolean(search || warehouseId || status !== 'all' || datePreset !== 'all');
  const clearFilters = () => {
    setSearch('');
    setWarehouseId('');
    setStatus('all');
    setDatePreset('all');
  };

  const closeModal = () => {
    setCreateOpen(false);
    reset({ warehouseId: '', date: today, notes: '', items: [] });
  };

  const onSubmit = (data: NewCountForm) => {
    createCount.mutate({
      warehouseId: data.warehouseId,
      date: data.date,
      notes: data.notes || undefined,
      items: data.items.map((item) => ({
        productId: item.productId,
        expectedQty: item.expectedQty,
        countedQty: Number(item.countedQty),
      })),
    }, { onSuccess: closeModal });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stok Sayımları"
        subtitle="Fiziksel stok sayımlarını planlayın, takip edin ve stok farklarını yönetin."
        className="mb-0"
        action={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Yeni Sayım</Button>}
      />

      {isLoading ? <SummarySkeleton /> : (
        <div className="grid rounded-xl border border-slate-800/80 bg-slate-950/35 sm:grid-cols-4">
          {[
            { label: 'Devam Eden', value: summary.active, className: summary.active > 0 ? 'text-amber-300' : 'text-slate-100' },
            { label: 'Tamamlanan', value: summary.finalized, className: 'text-emerald-300' },
            { label: 'Toplam Kalem', value: summary.totalItems, className: 'text-slate-100' },
            { label: 'Bu Ay', value: summary.thisMonth, className: 'text-sky-300' },
          ].map((metric) => (
            <div key={metric.label} className="border-b border-slate-800/70 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <p className={cn('text-base font-semibold tabular-nums', metric.className)}>{numberFormat(metric.value)}</p>
              <p className="mt-0.5 text-[11px] font-medium uppercase text-slate-500">{metric.label}</p>
            </div>
          ))}
        </div>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Aktif Sayımlar</h2>
            <p className="mt-0.5 text-xs text-slate-500">Tamamlanmamış fiziksel sayım çalışmaları.</p>
          </div>
        </div>
        {isLoading ? (
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 p-4">
            <div className="h-5 w-32 animate-pulse rounded bg-slate-800/80" />
            <div className="mt-3 h-3 w-64 animate-pulse rounded bg-slate-800/60" />
          </div>
        ) : activeCounts.length === 0 ? (
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-5">
            <p className="text-sm font-semibold text-slate-200">Devam eden sayım yok</p>
            <p className="mt-1 text-sm text-slate-500">Yeni bir fiziksel stok sayımı başlatabilirsiniz.</p>
            <Button className="mt-4" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateOpen(true)}>Yeni Sayım</Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {activeCounts.map((count) => {
              const itemCount = count._count?.items ?? 0;
              return (
                <button
                  key={count.id}
                  type="button"
                  onClick={() => router.push(`/dashboard/stock/counts/${count.id}`)}
                  className="rounded-xl border border-slate-800/80 bg-slate-950/35 p-4 text-left transition-colors duration-150 hover:bg-sky-500/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-sky-300">{count.number}</p>
                      <p className="mt-1 text-base font-semibold text-slate-100">{count.warehouse?.name ?? 'Depo bilgisi yok'}</p>
                      <p className="mt-1 text-sm text-slate-500">{formatDate(count.date)} · {numberFormat(itemCount)} kalem</p>
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-xs font-medium text-amber-300">Sayım devam ediyor</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge finalized={count.isFinalized} />
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-sky-300">
                        Sayıma Devam Et <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {counts.length === 0 && !isLoading ? (
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-10 text-center">
          <ClipboardCheck className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm font-semibold text-slate-200">Henüz stok sayımı yapılmamış</p>
          <p className="mt-1 text-sm text-slate-500">Fiziksel stok ile sistem stoklarını karşılaştırmak için ilk sayımınızı oluşturun.</p>
          <Button className="mt-4" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateOpen(true)}>İlk Sayımı Başlat</Button>
        </div>
      ) : (
        <section>
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-white">Sayım Kayıtları</h2>
            <p className="mt-0.5 text-xs text-slate-500">Devam eden ve tamamlanan fiziksel stok sayımları.</p>
          </div>

          <div className="mb-3 rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="min-w-[220px] flex-1">
                <Input aria-label="Sayım no ara" placeholder="Sayım no ara..." value={search} onChange={(event) => setSearch(event.target.value)} prefixIcon={<Search className="h-4 w-4" />} />
              </div>
              <WarehouseSelect value={warehouseId} onChange={setWarehouseId} className="w-full lg:w-52" placeholder="Tüm Depolar" />
              <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} aria-label="Sayım durumu" className="h-10 w-full rounded-xl border border-slate-700/75 bg-slate-950/35 px-3.5 text-sm text-slate-200 outline-none transition-all duration-150 hover:border-slate-600/80 hover:bg-slate-900/60 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/35 lg:w-44">
                <option value="all">Tüm Durumlar</option>
                <option value="active">Devam Ediyor</option>
                <option value="finalized">Tamamlandı</option>
              </select>
              <select value={datePreset} onChange={(event) => setDatePreset(event.target.value as DatePreset)} aria-label="Tarih filtresi" className="h-10 w-full rounded-xl border border-slate-700/75 bg-slate-950/35 px-3.5 text-sm text-slate-200 outline-none transition-all duration-150 hover:border-slate-600/80 hover:bg-slate-900/60 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/35 lg:w-40">
                <option value="all">Tüm Zamanlar</option>
                <option value="30d">Son 30 Gün</option>
                <option value="month">Bu Ay</option>
              </select>
              {hasFilters && <Button variant="ghost" size="sm" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Temizle</Button>}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-900/95">
                  <tr className="border-b border-slate-800/80">
                    {['Sayım No', 'Depo', 'Tarih', 'Kalem', 'Fark', 'Durum', ''].map((header, index) => (
                      <th key={header || index} className={cn('px-4 py-3 text-left text-[11px] font-semibold uppercase text-slate-500', [3, 4].includes(index) && 'text-right', index === 5 && 'text-center')}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? <TableSkeleton /> : filteredCounts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center">
                        <p className="text-sm font-semibold text-slate-200">Sayım kaydı bulunamadı</p>
                        <p className="mt-1 text-sm text-slate-500">Arama veya filtre kriterlerini değiştirin.</p>
                        {hasFilters && <Button className="mt-4" size="sm" variant="secondary" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Filtreleri Temizle</Button>}
                      </td>
                    </tr>
                  ) : filteredCounts.map((count) => (
                    <tr
                      key={count.id}
                      tabIndex={0}
                      onClick={() => router.push(`/dashboard/stock/counts/${count.id}`)}
                      onKeyDown={(event) => { if (event.key === 'Enter') router.push(`/dashboard/stock/counts/${count.id}`); }}
                      className="group cursor-pointer border-b border-slate-800/45 transition-colors duration-150 last:border-b-0 hover:bg-sky-500/[0.04] focus-visible:bg-sky-500/[0.06] focus-visible:outline-none"
                    >
                      <td className="px-4 py-3.5 font-mono font-semibold text-sky-300">{count.number}</td>
                      <td className="px-4 py-3.5 text-slate-200">{count.warehouse?.name ?? '-'}</td>
                      <td className="px-4 py-3.5 text-slate-400">{formatDate(count.date)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-slate-300">{numberFormat(count._count?.items ?? 0)}</td>
                      <td className="px-4 py-3.5 text-right text-slate-500">Detayda</td>
                      <td className="px-4 py-3.5 text-center"><StatusBadge finalized={count.isFinalized} /></td>
                      <td className="w-10 px-4 py-3.5 text-right"><ChevronRight className="h-4 w-4 text-slate-600 opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <Modal
        isOpen={createOpen}
        onClose={closeModal}
        title="Yeni Stok Sayımı"
        description="Depo seçin, sistem mevcut stok miktarlarını otomatik yükleyecek."
        size="lg"
        footer={<><Button variant="ghost" size="sm" leftIcon={<X className="h-3.5 w-3.5" />} onClick={closeModal}>İptal</Button><Button size="sm" loading={createCount.isPending} leftIcon={<Save className="h-3.5 w-3.5" />} onClick={handleSubmit(onSubmit)} disabled={fields.length === 0}>Sayımı Başlat</Button></>}
      >
        <form className="space-y-5">
          <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
            <div className="mb-3 flex items-center gap-2">
              <WarehouseIcon className="h-4 w-4 text-sky-400" />
              <span className="text-xs font-semibold text-white">Sayım Bilgileri</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <WarehouseSelect label="Depo" required value={watchWarehouse ?? ''} onChange={(value) => setValue('warehouseId', value, { shouldDirty: true, shouldValidate: true })} error={errors.warehouseId?.message} />
              <DatePicker label="Tarih" required value={watchDate} onValueChange={(value) => setValue('date', value ?? '', { shouldDirty: true, shouldValidate: true })} error={errors.date?.message} clearable={false} />
            </div>
            <Input className="mt-3" label="Notlar" placeholder="Sayım açıklaması (opsiyonel)..." {...register('notes')} />
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-violet-300" />
                <span className="text-xs font-semibold text-white">Sayım Kalemleri</span>
              </div>
              {fields.length > 0 && <span className="text-xs font-medium text-slate-500">{fields.length} ürün</span>}
            </div>

            {fields.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700/50 bg-slate-950/35 py-10 text-center">
                <ClipboardCheck className="mx-auto mb-3 h-8 w-8 text-slate-700" />
                <p className="text-sm font-medium text-slate-500">{watchWarehouse ? 'Bu depoda stok kaydı bulunamadı.' : 'Depo seçerek başlayın'}</p>
                {!watchWarehouse && <p className="mt-1 text-xs text-slate-600">Depo seçildiğinde ürünler otomatik yüklenecek.</p>}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-800">
                <div className="grid grid-cols-12 gap-2 border-b border-slate-800/60 bg-slate-900/70 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <div className="col-span-1 text-center">#</div>
                  <div className="col-span-4">Ürün</div>
                  <div className="col-span-2 text-right">Sistem</div>
                  <div className="col-span-3 text-center">Sayılan</div>
                  <div className="col-span-2 text-right">Fark</div>
                </div>
                <div className="max-h-80 divide-y divide-slate-800/40 overflow-y-auto">
                  {fields.map((field, idx) => {
                    const counted = Number(watchedItems[idx]?.countedQty || 0);
                    const expected = field.expectedQty;
                    const diff = counted - expected;
                    return (
                      <div key={field.id} className="grid grid-cols-12 items-center gap-2 px-4 py-3 transition-colors hover:bg-slate-800/20">
                        <div className="col-span-1 text-center"><span className="font-mono text-[10px] text-slate-600">{idx + 1}</span></div>
                        <div className="col-span-4 min-w-0">
                          <p className="truncate text-sm text-slate-200">{field.productName}</p>
                          <p className="font-mono text-[10px] text-slate-500">{field.productCode}</p>
                        </div>
                        <div className="col-span-2 text-right"><span className="text-sm tabular-nums text-slate-400">{formatQty(expected)}</span></div>
                        <div className="col-span-3 flex justify-center">
                          <input
                            type="number"
                            step="1"
                            min="0"
                            placeholder={String(expected)}
                            className={cn('w-full max-w-[90px] rounded-lg border bg-slate-800 px-2 py-1.5 text-center text-sm tabular-nums text-white transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-sky-500', errors.items?.[idx]?.countedQty ? 'border-red-500' : 'border-slate-700')}
                            {...register(`items.${idx}.countedQty`)}
                          />
                        </div>
                        <div className="col-span-2 text-right">
                          <span className={cn('inline-flex min-w-[40px] justify-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums', diff === 0 ? 'bg-slate-800 text-slate-500' : diff > 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300')}>
                            {diff === 0 ? '0' : diff > 0 ? `+${formatQty(diff)}` : formatQty(diff)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {fields.length > 0 && (() => {
            const diffCount = fields.reduce((sum, field, index) => {
              const counted = Number(watchedItems[index]?.countedQty || 0);
              return counted - field.expectedQty !== 0 ? sum + 1 : sum;
            }, 0);
            return (
              <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/35 p-3">
                <ClipboardCheck className="h-4 w-4 shrink-0 text-sky-400" />
                <div className="flex-1 text-xs text-slate-400">
                  <span className="font-semibold text-white">{fields.length}</span> kalem yüklendi
                  {diffCount > 0 && <span className="ml-3 font-medium text-amber-300">{diffCount} kalemde fark var</span>}
                </div>
              </div>
            );
          })()}
        </form>
      </Modal>
    </div>
  );
}
