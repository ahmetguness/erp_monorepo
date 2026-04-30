'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus, ClipboardCheck, Warehouse as WarehouseIcon,
  Package, Save, X, ArrowRight, Hash,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useStockCounts, useCreateStockCount, useWarehouses, useStockLevels } from '@/hooks/useStock';
import { cn, formatDate } from '@/lib/utils';
import type { StockCount } from '@/services/stock.service';

// ─────────────────────────────────────────────
// New count form schema
// ─────────────────────────────────────────────

const countItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  productCode: z.string(),
  expectedQty: z.coerce.number(),
  countedQty: z.string().default('0'),
});

const newCountSchema = z.object({
  warehouseId: z.string().min(1, 'Depo seçiniz'),
  date: z.string().min(1, 'Tarih zorunlu'),
  notes: z.string().optional(),
  items: z.array(countItemSchema).min(1, 'En az bir kalem olmalı'),
});

type NewCountForm = z.infer<typeof newCountSchema>;

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function StockCountsPage() {
  const router = useRouter();
  const { data: counts = [], isLoading } = useStockCounts();
  const { data: warehouses = [] } = useWarehouses();
  const createCount = useCreateStockCount();

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');

  const { data: levels = [] } = useStockLevels({ warehouseId: selectedWarehouse || undefined });

  const warehouseOptions = warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }));

  const today = new Date().toISOString().split('T')[0];

  const { register, handleSubmit, control, reset, setValue, watch, formState: { errors } } = useForm<NewCountForm>({
    // @ts-expect-error -- zodResolver type mismatch with react-hook-form generics
    resolver: zodResolver(newCountSchema),
    defaultValues: { warehouseId: '', date: today, notes: '', items: [] },
  });

  const { fields } = useFieldArray({ control, name: 'items' });
  const watchWarehouse = watch('warehouseId');

  // When warehouse changes, load stock levels as items
  useEffect(() => {
    if (watchWarehouse) {
      setSelectedWarehouse(watchWarehouse);
    }
  }, [watchWarehouse]);

  useEffect(() => {
    if (levels.length > 0 && selectedWarehouse) {
      const items = levels.map((sl) => ({
        productId: sl.productId,
        productName: sl.product?.name ?? '—',
        productCode: sl.product?.code ?? '',
        expectedQty: Number(sl.quantity),
        countedQty: '0',
      }));
      setValue('items', items);
    }
  }, [levels, selectedWarehouse, setValue]);

  const closeModal = () => {
    setCreateOpen(false);
    setSelectedWarehouse('');
    reset({ warehouseId: '', date: today, notes: '', items: [] });
  };

  const onSubmit = (data: NewCountForm) => {
    createCount.mutate(
      {
        warehouseId: data.warehouseId,
        date: data.date,
        notes: data.notes || undefined,
        items: data.items.map((item) => ({
          productId: item.productId,
          expectedQty: item.expectedQty,
          countedQty: Number(item.countedQty),
        })),
      },
      {
        onSuccess: () => {
          closeModal();
        },
      },
    );
  };

  const columns: ColumnDef<StockCount>[] = [
    { key: 'number', header: 'No', width: '120px', render: (r) => <span className="font-mono text-sky-400">{r.number}</span> },
    { key: 'warehouse', header: 'Depo', render: (r) => <span className="text-slate-200">{r.warehouse?.name ?? '—'}</span> },
    { key: 'date', header: 'Tarih', width: '110px', render: (r) => <span className="text-slate-400">{formatDate(r.date)}</span> },
    { key: 'items', header: 'Kalem', width: '80px', align: 'right', render: (r) => <span className="text-slate-300">{r._count?.items ?? 0}</span> },
    {
      key: 'isFinalized', header: 'Durum', width: '100px', align: 'center',
      render: (r) => <Badge variant={r.isFinalized ? 'success' : 'warning'}>{r.isFinalized ? 'Tamamlandı' : 'Devam Ediyor'}</Badge>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Stok Sayımları"
        subtitle="Fiziksel stok sayımlarını yönetin."
        action={
          <Link
            href="#"
            onClick={(e) => { e.preventDefault(); setCreateOpen(true); }}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white
                       bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500
                       shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30
                       transition-all duration-200 active:scale-[0.97]"
          >
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15 group-hover:bg-white/20 transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </span>
            Yeni Sayım
          </Link>
        }
      />

      <DataTable
        columns={columns}
        data={counts}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        onRowClick={(r) => router.push(`/dashboard/stock/counts/${r.id}`)}
        emptyTitle="Henüz sayım yapılmamış"
        emptyDescription="Yeni bir sayım başlatarak stok kontrolü yapın."
      />

      {/* ── New count modal ─────────────────────── */}
      <Modal isOpen={createOpen} onClose={closeModal} title="Yeni Stok Sayımı"
        description="Depo seçin, sistem mevcut stok miktarlarını otomatik yükleyecek." size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" leftIcon={<X className="w-3.5 h-3.5" />} onClick={closeModal}>İptal</Button>
            <Button size="sm" loading={createCount.isPending} leftIcon={<Save className="w-3.5 h-3.5" />}
              onClick={handleSubmit(onSubmit)} disabled={fields.length === 0}
              className="bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20">
              Sayımı Başlat
            </Button>
          </>
        }
      >
        <form className="space-y-5">
          {/* ── Step 1: Warehouse & date ────────────── */}
          <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-sky-500/10">
                <WarehouseIcon className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <span className="text-xs font-semibold text-white">Sayım Bilgileri</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Depo" required options={[{ value: '', label: '— Depo seçin —' }, ...warehouseOptions]}
                error={errors.warehouseId?.message} {...register('warehouseId')} />
              <Input label="Tarih" required type="date" {...register('date')} />
            </div>
            <Input label="Notlar" placeholder="Sayım açıklaması (opsiyonel)…" {...register('notes')} />
          </div>

          {/* ── Step 2: Items ──────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-violet-500/10">
                  <Package className="w-3.5 h-3.5 text-violet-400" />
                </div>
                <span className="text-xs font-semibold text-white">Sayım Kalemleri</span>
              </div>
              {fields.length > 0 && (
                <span className="text-[10px] font-medium text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full">
                  {fields.length} ürün
                </span>
              )}
            </div>

            {fields.length === 0 ? (
              <div className="py-10 text-center border border-dashed border-slate-700/50 rounded-xl bg-slate-800/20">
                <ClipboardCheck className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-500">
                  {watchWarehouse ? 'Bu depoda stok kaydı bulunamadı.' : 'Depo seçerek başlayın'}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  {watchWarehouse ? '' : 'Depo seçildiğinde ürünler otomatik yüklenecek.'}
                </p>
              </div>
            ) : (
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-800/50 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800/60">
                  <div className="col-span-1 text-center">#</div>
                  <div className="col-span-4">Ürün</div>
                  <div className="col-span-2 text-right">Sistem</div>
                  <div className="col-span-3 text-center">Sayılan</div>
                  <div className="col-span-2 text-right">Fark</div>
                </div>

                {/* Rows */}
                <div className="divide-y divide-slate-800/40 max-h-80 overflow-y-auto">
                  {fields.map((field, idx) => {
                    const counted = Number(watch(`items.${idx}.countedQty`) || 0);
                    const expected = field.expectedQty;
                    const diff = counted - expected;
                    const hasCounted = true;
                    const hasDiff = hasCounted && diff !== 0;

                    return (
                      <div key={field.id} className={cn(
                        'grid grid-cols-12 gap-2 px-4 py-3 items-center transition-colors',
                        hasDiff ? (diff > 0 ? 'bg-emerald-500/[0.03]' : 'bg-red-500/[0.03]') : 'hover:bg-slate-800/20',
                      )}>
                        <div className="col-span-1 text-center">
                          <span className="text-[10px] font-mono text-slate-600">{idx + 1}</span>
                        </div>
                        <div className="col-span-4 min-w-0">
                          <p className="text-sm text-slate-200 truncate">{field.productName}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{field.productCode}</p>
                        </div>
                        <div className="col-span-2 text-right">
                          <span className="text-sm font-medium text-slate-400 tabular-nums">{expected}</span>
                        </div>
                        <div className="col-span-3 flex justify-center">
                          <input
                            type="number"
                            step="1"
                            min="0"
                            placeholder={String(expected)}
                            className={cn(
                              'w-full max-w-[90px] bg-slate-800 border rounded-lg text-sm text-center text-white px-2 py-1.5 tabular-nums',
                              'focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-colors',
                              errors.items?.[idx]?.countedQty ? 'border-red-500' : 'border-slate-700',
                            )}
                            {...register(`items.${idx}.countedQty`)}
                          />
                        </div>
                        <div className="col-span-2 text-right">
                          {hasCounted ? (
                            <span className={cn(
                              'inline-flex items-center justify-center min-w-[36px] text-xs font-bold px-1.5 py-0.5 rounded-md tabular-nums',
                              diff === 0
                                ? 'bg-slate-800 text-slate-500'
                                : diff > 0
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : 'bg-red-500/15 text-red-400',
                            )}>
                              {diff === 0 ? '0' : diff > 0 ? `+${diff}` : diff}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-700">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Summary bar ────────────────────────── */}
          {fields.length > 0 && (() => {
            const filledCount = fields.length;
            const totalDiffPlus = fields.reduce((sum, f, i) => {
              const c = Number(watch(`items.${i}.countedQty`) || 0);
              const d = c - f.expectedQty;
              return d > 0 ? sum + d : sum;
            }, 0);
            const totalDiffMinus = fields.reduce((sum, f, i) => {
              const c = Number(watch(`items.${i}.countedQty`) || 0);
              const d = c - f.expectedQty;
              return d < 0 ? sum + d : sum;
            }, 0);

            return (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                <ClipboardCheck className="w-4 h-4 text-sky-400 shrink-0" />
                <div className="flex-1 flex items-center gap-4 text-xs">
                  <span className="text-slate-400">
                    <span className="font-semibold text-white">{filledCount}</span>/{fields.length} sayıldı
                  </span>
                  {totalDiffPlus > 0 && (
                    <span className="text-emerald-400 font-medium">+{totalDiffPlus} fazla</span>
                  )}
                  {totalDiffMinus < 0 && (
                    <span className="text-red-400 font-medium">{totalDiffMinus} eksik</span>
                  )}
                </div>
                <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-400 rounded-full transition-all duration-300"
                    style={{ width: `${fields.length > 0 ? (filledCount / fields.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            );
          })()}
        </form>
      </Modal>
    </div>
  );
}
