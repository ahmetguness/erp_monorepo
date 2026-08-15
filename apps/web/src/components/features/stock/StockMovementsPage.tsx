'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Coins,
  FilterX,
  FolderOpen,
  Hash,
  Plus,
  RotateCcw,
  Save,
  Search,
  StickyNote,
  X,
} from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/shared/PageHeader';
import { ProductSelect, WarehouseSelect } from '@/components/shared/EntitySelect';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { FormRow } from '@/components/shared/FormField';
import { useStockMovements, useCreateManualMovement } from '@/hooks/useStock';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import { cn } from '@/lib/utils';
import type { StockMovement, StockMovementType } from '@/services/stock.service';

type DatePreset = 'all' | 'today' | '7d' | '30d';

const MOVEMENT_TYPE_META: Record<StockMovementType, { label: string; icon: React.ElementType; color: string; sign: '+' | '-' | '' }> = {
  IN: { label: 'Giriş', icon: ArrowDownToLine, color: 'text-emerald-300', sign: '+' },
  OUT: { label: 'Çıkış', icon: ArrowUpFromLine, color: 'text-red-300', sign: '-' },
  TRANSFER: { label: 'Transfer', icon: ArrowLeftRight, color: 'text-sky-300', sign: '' },
  ADJUSTMENT: { label: 'Düzeltme', icon: RotateCcw, color: 'text-amber-300', sign: '' },
  RETURN: { label: 'İade', icon: ArrowDownToLine, color: 'text-violet-300', sign: '+' },
  OPENING: { label: 'Açılış', icon: FolderOpen, color: 'text-slate-300', sign: '' },
};

function isMovementType(value: string | null): value is StockMovementType {
  return Boolean(value && value in MOVEMENT_TYPE_META);
}

const MANUAL_MOVE_TYPES = [
  { value: 'IN', label: 'Giriş', icon: ArrowDownToLine, color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  { value: 'OUT', label: 'Çıkış', icon: ArrowUpFromLine, color: 'text-red-300', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  { value: 'ADJUSTMENT', label: 'Düzeltme', icon: RotateCcw, color: 'text-amber-300', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  { value: 'OPENING', label: 'Açılış', icon: FolderOpen, color: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-600/60' },
] as const;

const manualMovementSchema = z.object({
  productId: z.string().min(1, 'Ürün seçiniz'),
  type: z.enum(['IN', 'OUT', 'ADJUSTMENT', 'OPENING']),
  quantity: z.string().min(1, 'Miktar zorunludur'),
  warehouseId: z.string().min(1, 'Depo seçiniz'),
  unitCost: z.string().optional(),
  notes: z.string().optional(),
});

type ManualMovementForm = z.infer<typeof manualMovementSchema>;

function formatQuantity(value: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(value);
}

function formatDateParts(value: string) {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(date),
  };
}

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateRangeForPreset(preset: DatePreset): { dateFrom?: string; dateTo?: string } {
  if (preset === 'all') return {};
  const now = new Date();
  const start = new Date(now);
  if (preset === 'today') start.setHours(0, 0, 0, 0);
  if (preset === '7d') start.setDate(start.getDate() - 7);
  if (preset === '30d') start.setDate(start.getDate() - 30);
  return { dateFrom: toDateInput(start), dateTo: toDateInput(now) };
}

function MovementIndicator({ type }: { type: StockMovementType }) {
  const meta = MOVEMENT_TYPE_META[type];
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', meta.color)}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

function MovementQuantity({ movement }: { movement: StockMovement }) {
  const meta = MOVEMENT_TYPE_META[movement.type];
  const value = Number(movement.quantity);
  return (
    <span className={cn('font-semibold tabular-nums', meta.color)}>
      {meta.sign}{formatQuantity(value)}
    </span>
  );
}

function WarehouseRoute({ movement }: { movement: StockMovement }) {
  if (movement.type === 'TRANSFER') {
    return (
      <div>
        <p className="font-medium text-slate-200">{movement.fromWarehouse?.name ?? 'Kaynak depo'} <span className="text-slate-600">→</span> {movement.toWarehouse?.name ?? 'Hedef depo'}</p>
        <p className="text-xs text-slate-500">Depolar arası transfer</p>
      </div>
    );
  }
  const warehouse = movement.toWarehouse ?? movement.fromWarehouse;
  return <span className="text-sm text-slate-400">{warehouse?.name ?? '-'}</span>;
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, row) => (
        <tr key={row} className="border-b border-slate-800/45 last:border-0">
          {Array.from({ length: 6 }).map((__, col) => (
            <td key={col} className="px-4 py-3.5">
              <div className="h-3.5 animate-pulse rounded bg-slate-800/75" style={{ width: `${42 + ((row + col) % 3) * 18}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

interface StockMovementsPageProps {
  defaultType?: StockMovementType | '';
  title?: string;
}

export function StockMovementsPage({ defaultType = '', title = 'Stok Hareketleri' }: StockMovementsPageProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get('productId') ?? '';
  const typeParam = searchParams.get('type');
  const initialType = defaultType || (isMovementType(typeParam) ? typeParam : '');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<StockMovementType | ''>(initialType);
  const [warehouseId, setWarehouseId] = useState('');
  const [productId, setProductId] = useState(initialProductId);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const { multiWarehouse } = usePlanFeatures();

  const dateRange = dateRangeForPreset(datePreset);
  const { data, isLoading } = useStockMovements({
    page,
    limit: 20,
    productId: productId || undefined,
    warehouseId: warehouseId || undefined,
    type: type || undefined,
    ...dateRange,
  });
  const createMovement = useCreateManualMovement();
  const movements = useMemo(() => data?.data ?? [], [data]);

  const visibleMovements = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return movements;
    return movements.filter((movement) => [movement.product?.name ?? '', movement.product?.code ?? ''].some((value) => value.toLocaleLowerCase('tr-TR').includes(q)));
  }, [movements, query]);

  const summary = useMemo(() => ({
    total: visibleMovements.length,
    inQty: visibleMovements.filter((item) => item.type === 'IN' || item.type === 'RETURN').reduce((sum, item) => sum + Number(item.quantity), 0),
    outQty: visibleMovements.filter((item) => item.type === 'OUT').reduce((sum, item) => sum + Number(item.quantity), 0),
    transferCount: visibleMovements.filter((item) => item.type === 'TRANSFER').length,
  }), [visibleMovements]);

  const { register, handleSubmit, reset, control, setValue, formState: { errors } } = useForm<ManualMovementForm>({
    resolver: zodResolver(manualMovementSchema),
    defaultValues: { type: 'IN' },
  });

  const selectedType = useWatch({ control, name: 'type' });
  const selectedProductId = useWatch({ control, name: 'productId' });
  const selectedWarehouseId = useWatch({ control, name: 'warehouseId' });
  const activeType = MANUAL_MOVE_TYPES.find((item) => item.value === selectedType) ?? MANUAL_MOVE_TYPES[0];
  const ActiveTypeIcon = activeType.icon;

  const hasFilters = Boolean(query || type || warehouseId || productId || datePreset !== 'all');
  const clearFilters = () => {
    setQuery('');
    setType('');
    setWarehouseId('');
    setProductId('');
    setDatePreset('all');
    setPage(1);
  };

  const onSubmit = (formData: ManualMovementForm) => {
    createMovement.mutate(
      { ...formData, quantity: Number(formData.quantity), unitCost: formData.unitCost ? Number(formData.unitCost) : undefined },
      { onSuccess: () => { setCreateOpen(false); reset(); } },
    );
  };

  const closeModal = () => { setCreateOpen(false); reset(); };

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        subtitle="Tüm stok giriş, çıkış, transfer ve düzeltme hareketlerini takip edin."
        className="mb-0"
        action={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Manuel Hareket</Button>}
      />

      {!multiWarehouse && (
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Depo transferleri Professional ile açılır</p>
              <p className="mt-0.5 text-xs text-slate-500">Starter tek depo akışı içindir. Depolar arası transfer menüsü yükseltme ile kullanılabilir.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/upgrade-preview?feature=Depo%20Transferleri&plan=PROFESSIONAL&module=inventory')}>
              Yükseltmeyi Gör
            </Button>
          </div>
        </div>
      )}

      <div className="grid rounded-xl border border-slate-800/80 bg-slate-950/35 sm:grid-cols-4">
        {[
          { label: 'Hareket', value: formatQuantity(summary.total), className: 'text-slate-100' },
          { label: 'Giriş', value: `+${formatQuantity(summary.inQty)}`, className: 'text-emerald-300' },
          { label: 'Çıkış', value: summary.outQty > 0 ? `-${formatQuantity(summary.outQty)}` : '0', className: summary.outQty > 0 ? 'text-red-300' : 'text-slate-100' },
          { label: 'Transfer', value: formatQuantity(summary.transferCount), className: 'text-sky-300' },
        ].map((metric) => (
          <div key={metric.label} className="border-b border-slate-800/70 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
            <p className={cn('text-base font-semibold tabular-nums', metric.className)}>{metric.value}</p>
            <p className="mt-0.5 text-[11px] font-medium uppercase text-slate-500">{metric.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="min-w-[240px] flex-1">
            <Input aria-label="Ürün ara" placeholder="Ürün adı veya kod ara..." value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} prefixIcon={<Search className="h-4 w-4" />} />
          </div>
          <select value={type} onChange={(event) => { setType(event.target.value as StockMovementType | ''); setPage(1); }} aria-label="Hareket tipi" className="h-10 w-full rounded-xl border border-slate-700/75 bg-slate-950/35 px-3.5 text-sm text-slate-200 outline-none transition-all duration-150 hover:border-slate-600/80 hover:bg-slate-900/60 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/35 xl:w-44">
            <option value="">Tüm Hareketler</option>
            {Object.entries(MOVEMENT_TYPE_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
          <WarehouseSelect value={warehouseId} onChange={(value) => { setWarehouseId(value); setPage(1); }} className="w-full xl:w-52" placeholder="Tüm Depolar" />
          <ProductSelect value={productId} onChange={(value) => { setProductId(value); setPage(1); }} className="w-full xl:w-56" placeholder="Tüm Ürünler" />
          <select value={datePreset} onChange={(event) => { setDatePreset(event.target.value as DatePreset); setPage(1); }} aria-label="Tarih filtresi" className="h-10 w-full rounded-xl border border-slate-700/75 bg-slate-950/35 px-3.5 text-sm text-slate-200 outline-none transition-all duration-150 hover:border-slate-600/80 hover:bg-slate-900/60 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/35 xl:w-40">
            <option value="all">Tüm Zamanlar</option>
            <option value="today">Bugün</option>
            <option value="7d">Son 7 Gün</option>
            <option value="30d">Son 30 Gün</option>
          </select>
          {hasFilters && <Button variant="ghost" size="sm" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Temizle</Button>}
        </div>

        {hasFilters && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800/70 pt-3">
            {query && <FilterChip label={`Arama: ${query}`} onRemove={() => setQuery('')} />}
            {type && <FilterChip label={MOVEMENT_TYPE_META[type].label} onRemove={() => setType('')} />}
            {warehouseId && <FilterChip label="Depo filtresi" onRemove={() => setWarehouseId('')} />}
            {productId && <FilterChip label="Ürün filtresi" onRemove={() => setProductId('')} />}
            {datePreset !== 'all' && <FilterChip label={datePreset === 'today' ? 'Bugün' : datePreset === '7d' ? 'Son 7 gün' : 'Son 30 gün'} onRemove={() => setDatePreset('all')} />}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-900/95">
              <tr className="border-b border-slate-800/80">
                {['Tarih', 'Hareket', 'Ürün', 'Depo', 'Miktar', 'Referans'].map((header, index) => (
                  <th key={header} className={cn('px-4 py-3 text-left text-[11px] font-semibold uppercase text-slate-500', index === 4 && 'text-right')}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? <TableSkeleton /> : visibleMovements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <p className="text-sm font-semibold text-slate-200">{hasFilters ? 'Filtrelerle eşleşen hareket bulunamadı' : 'Henüz stok hareketi bulunmuyor'}</p>
                    <p className="mt-1 text-sm text-slate-500">{hasFilters ? 'Arama veya filtre kriterlerini değiştirin.' : 'Stok girişleri, çıkışları ve transferleri burada görüntülenecek.'}</p>
                    <div className="mt-4 flex justify-center gap-2">
                      {hasFilters && <Button size="sm" variant="secondary" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Filtreleri Temizle</Button>}
                      {!hasFilters && <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateOpen(true)}>Manuel Hareket</Button>}
                    </div>
                  </td>
                </tr>
              ) : visibleMovements.map((movement) => {
                const parts = formatDateParts(movement.createdAt);
                return (
                  <tr key={movement.id} className="border-b border-slate-800/45 transition-colors duration-150 last:border-b-0 hover:bg-sky-500/[0.035]">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-200">{parts.date}</p>
                      <p className="text-xs text-slate-500">{parts.time}</p>
                    </td>
                    <td className="px-4 py-3.5"><MovementIndicator type={movement.type} /></td>
                    <td className="px-4 py-3.5">
                      {movement.product?.id ? (
                        <button type="button" onClick={() => router.push(`/dashboard/products/${movement.productId}`)} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40">
                          <p className="font-medium text-slate-100 transition-colors hover:text-sky-300">{movement.product?.name ?? '-'}</p>
                          <p className="font-mono text-xs text-slate-500">{movement.product?.code ?? ''}</p>
                        </button>
                      ) : <span className="text-slate-500">-</span>}
                    </td>
                    <td className="px-4 py-3.5"><WarehouseRoute movement={movement} /></td>
                    <td className="px-4 py-3.5 text-right"><MovementQuantity movement={movement} /></td>
                    <td className="px-4 py-3.5">
                      <p className="text-sm text-slate-400">{movement.notes ? 'Manuel / Notlu' : movement.type === 'OPENING' ? 'Açılış' : 'Manuel Hareket'}</p>
                      {movement.notes && <p className="max-w-[220px] truncate text-xs text-slate-500">{movement.notes}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data && visibleMovements.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-800/70 bg-slate-900/35 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>{(page - 1) * 20 + 1}-{Math.min(page * 20, data.meta.total)} / {data.meta.total} hareket</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Önceki</Button>
              <span className="tabular-nums text-slate-300">{page} / {data.meta.totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= data.meta.totalPages} onClick={() => setPage((value) => Math.min(data.meta.totalPages, value + 1))}>Sonraki</Button>
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={createOpen}
        onClose={closeModal}
        title="Manuel Stok Hareketi"
        description="Ürün için manuel stok girişi, çıkışı veya düzeltme yapın."
        size="md"
        footer={<><Button variant="ghost" size="sm" leftIcon={<X className="h-3.5 w-3.5" />} onClick={closeModal}>İptal</Button><Button size="sm" loading={createMovement.isPending} leftIcon={<Save className="h-3.5 w-3.5" />} onClick={handleSubmit(onSubmit)}>Kaydet</Button></>}
      >
        <form className="space-y-5">
          <div>
            <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Hareket Tipi</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MANUAL_MOVE_TYPES.map((item) => {
                const Icon = item.icon;
                const active = selectedType === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setValue('type', item.value)}
                    className={cn('flex items-center justify-center gap-2 rounded-xl border p-3 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40', active ? `${item.bg} ${item.border}` : 'border-slate-800 bg-slate-950/35 text-slate-500 hover:border-slate-700 hover:text-slate-300')}
                  >
                    <Icon className={cn('h-4 w-4', active && item.color)} />
                    <span className={cn('text-xs font-medium', active && item.color)}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-slate-800" />

          <div className="space-y-3">
            <ProductSelect label="Ürün" required value={selectedProductId ?? ''} onChange={(value) => setValue('productId', value, { shouldDirty: true, shouldValidate: true })} error={errors.productId?.message} />
            <WarehouseSelect label="Depo" required value={selectedWarehouseId ?? ''} onChange={(value) => setValue('warehouseId', value, { shouldDirty: true, shouldValidate: true })} error={errors.warehouseId?.message} />
          </div>

          <FormRow cols={2}>
            <Input label="Miktar" required type="number" step="0.001" placeholder="0.000" error={errors.quantity?.message} prefixIcon={<Hash className="h-3.5 w-3.5" />} {...register('quantity')} />
            <Input label="Birim Maliyet (₺)" type="number" step="0.01" placeholder="0.00" prefixIcon={<Coins className="h-3.5 w-3.5" />} {...register('unitCost')} />
          </FormRow>

          <Input label="Notlar" placeholder="Açıklama veya referans notu..." prefixIcon={<StickyNote className="h-3.5 w-3.5" />} {...register('notes')} />

          <div className={cn('flex items-center gap-2.5 rounded-lg border p-3', activeType.bg, activeType.border)}>
            <ActiveTypeIcon className={cn('h-4 w-4 shrink-0', activeType.color)} />
            <p className="text-xs text-slate-400">
              <span className={cn('font-semibold', activeType.color)}>{activeType.label}</span> hareketi oluşturulacak. Kaydet butonuna basarak işlemi onaylayın.
            </p>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button type="button" onClick={onRemove} className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 text-xs font-medium text-slate-300 transition-colors duration-150 hover:border-slate-700 hover:text-white">
      {label}
      <X className="h-3 w-3 text-slate-500" />
    </button>
  );
}
