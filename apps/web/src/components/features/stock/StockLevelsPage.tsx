'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronDown, ChevronRight, FilterX, Info, PackageCheck, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { WarehouseSelect } from '@/components/shared/EntitySelect';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAdvancedStockSuggestions, useStockAlerts, useStockLevels } from '@/hooks/useStock';
import { cn, formatCurrency } from '@/lib/utils';
import type { AdvancedStockSuggestion, StockLevel } from '@/services/stock.service';

type StockStatus = 'all' | 'normal' | 'low' | 'critical' | 'out';

const PRIORITY_LABEL: Record<AdvancedStockSuggestion['priority'], string> = {
  CRITICAL: 'Kritik Öncelik',
  HIGH: 'Yüksek Öncelik',
  MEDIUM: 'Orta Öncelik',
  LOW: 'Düşük Öncelik',
};

const PRIORITY_CLASS: Record<AdvancedStockSuggestion['priority'], string> = {
  CRITICAL: 'border-l-red-500',
  HIGH: 'border-l-amber-400',
  MEDIUM: 'border-l-sky-400',
  LOW: 'border-l-slate-600',
};

const PRIORITY_TEXT: Record<AdvancedStockSuggestion['priority'], string> = {
  CRITICAL: 'text-red-300',
  HIGH: 'text-amber-300',
  MEDIUM: 'text-sky-300',
  LOW: 'text-slate-400',
};

const VELOCITY_TREND_LABEL: Record<AdvancedStockSuggestion['salesVelocity']['trend'], string> = {
  ACCELERATING: 'Hızlanıyor',
  STABLE: 'Stabil',
  DECELERATING: 'Yavaşlıyor',
};

function formatQuantity(value: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(value);
}

function numberFormat(value: number): string {
  return new Intl.NumberFormat('tr-TR').format(value);
}

function getDeficit(level: StockLevel): number {
  return Number(level.quantity) - Number(level.product?.minStockLevel ?? 0);
}

function getStatus(level: StockLevel): Exclude<StockStatus, 'all'> {
  const quantity = Number(level.quantity);
  const min = Number(level.product?.minStockLevel ?? 0);
  if (quantity <= 0) return 'out';
  if (min > 0 && quantity < min) return 'critical';
  if (min > 0 && quantity <= min * 1.2) return 'low';
  return 'normal';
}

function statusRank(status: Exclude<StockStatus, 'all'>) {
  return { out: 0, critical: 1, low: 2, normal: 3 }[status];
}

function StatusBadge({ status }: { status: Exclude<StockStatus, 'all'> }) {
  const config = {
    out: { label: 'Stokta Yok', className: 'border-red-500/30 bg-red-500/10 text-red-300', icon: AlertTriangle },
    critical: { label: 'Kritik', className: 'border-red-500/25 bg-red-500/8 text-red-300', icon: AlertTriangle },
    low: { label: 'Düşük', className: 'border-amber-500/25 bg-amber-500/10 text-amber-300', icon: AlertTriangle },
    normal: { label: 'Normal', className: 'border-emerald-500/20 bg-emerald-500/8 text-emerald-300', icon: PackageCheck },
  }[status];
  const Icon = config.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium', config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid rounded-xl border border-slate-800/80 bg-slate-950/35 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="border-b border-slate-800/70 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
          <div className="h-5 w-14 animate-pulse rounded bg-slate-800/80" />
          <div className="mt-2 h-3 w-24 animate-pulse rounded bg-slate-800/60" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, row) => (
        <tr key={row} className="border-b border-slate-800/45 last:border-0">
          {Array.from({ length: 7 }).map((_, col) => (
            <td key={col} className="px-4 py-3.5">
              <div className="h-3.5 animate-pulse rounded bg-slate-800/75" style={{ width: `${42 + ((row + col) % 3) * 18}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function StockLevelsPage() {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StockStatus>('all');
  const [recommendationsOpen, setRecommendationsOpen] = useState(true);

  const { data: levels = [], isLoading } = useStockLevels({ warehouseId: warehouseId || undefined });
  const { data: advancedSuggestions = [], isLoading: loadingSuggestions } = useAdvancedStockSuggestions();
  const { data: stockAlerts } = useStockAlerts(5);

  const visibleSuggestions = useMemo(() => (
    warehouseId ? advancedSuggestions.filter((suggestion) => suggestion.warehouseId === warehouseId) : advancedSuggestions
  ), [advancedSuggestions, warehouseId]);

  const filteredLevels = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return levels
      .filter((level) => {
        const matchesSearch = !q || [level.product?.name ?? '', level.product?.code ?? ''].some((value) => value.toLocaleLowerCase('tr-TR').includes(q));
        const levelStatus = getStatus(level);
        const matchesStatus = status === 'all' || levelStatus === status;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const statusDelta = statusRank(getStatus(a)) - statusRank(getStatus(b));
        if (statusDelta !== 0) return statusDelta;
        return getDeficit(a) - getDeficit(b);
      });
  }, [levels, search, status]);

  const summary = useMemo(() => {
    const critical = levels.filter((level) => getStatus(level) === 'critical').length;
    const out = levels.filter((level) => getStatus(level) === 'out').length;
    const low = levels.filter((level) => getStatus(level) === 'low').length;
    const totalQuantity = levels.reduce((sum, level) => sum + Number(level.quantity), 0);
    return { total: levels.length, critical, out, low, totalQuantity };
  }, [levels]);

  const hasFilters = Boolean(warehouseId || search || status !== 'all');
  const clearFilters = () => {
    setWarehouseId('');
    setSearch('');
    setStatus('all');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stok Seviyeleri"
        subtitle="Ürünlerin depo bazlı stok durumunu izleyin ve kritik seviyeleri yönetin."
        className="mb-0"
      />

      {isLoading && levels.length === 0 ? <SummarySkeleton /> : (
        <div className="grid rounded-xl border border-slate-800/80 bg-slate-950/35 sm:grid-cols-4">
          {[
            { label: 'Stok Kalemi', value: numberFormat(summary.total), valueClass: 'text-slate-100' },
            { label: 'Kritik', value: numberFormat(summary.critical), valueClass: summary.critical > 0 ? 'text-red-300' : 'text-slate-100' },
            { label: 'Stokta Yok', value: numberFormat(summary.out), valueClass: summary.out > 0 ? 'text-red-300' : 'text-slate-100' },
            { label: 'Toplam Miktar', value: formatQuantity(summary.totalQuantity), valueClass: 'text-slate-100' },
          ].map((metric) => (
            <div key={metric.label} className="border-b border-slate-800/70 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <div className="flex items-center gap-1.5">
                <p className={cn('text-base font-semibold tabular-nums', metric.valueClass)}>{metric.value}</p>
                {metric.label === 'Kritik' && (
                  <span title="Toplam stok minimum stok eşiğinin altına düştüğünde ürün kritik olarak işaretlenir." className="text-slate-600">
                    <Info className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] font-medium uppercase text-slate-500">{metric.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-slate-800/80 bg-slate-950/35 p-3 lg:flex-row lg:items-center">
        <div className="min-w-[240px] flex-1">
          <Input aria-label="Ürün ara" placeholder="Ürün adı veya kod ara..." value={search} onChange={(event) => setSearch(event.target.value)} prefixIcon={<Search className="h-4 w-4" />} />
        </div>
        <WarehouseSelect value={warehouseId} onChange={setWarehouseId} className="w-full lg:w-52" placeholder="Tüm Depolar" />
        <select value={status} onChange={(event) => setStatus(event.target.value as StockStatus)} aria-label="Stok durumu" className="h-10 w-full rounded-xl border border-slate-700/75 bg-slate-950/35 px-3.5 text-sm text-slate-200 outline-none transition-all duration-150 hover:border-slate-600/80 hover:bg-slate-900/60 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/35 lg:w-44">
          <option value="all">Tüm Durumlar</option>
          <option value="normal">Normal</option>
          <option value="low">Düşük</option>
          <option value="critical">Kritik</option>
          <option value="out">Stokta Yok</option>
        </select>
        {hasFilters && <Button variant="ghost" size="sm" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Filtreleri Temizle</Button>}
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/35">
        <button
          type="button"
          onClick={() => setRecommendationsOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 border-b border-slate-800/70 px-4 py-3 text-left transition-colors duration-150 hover:bg-slate-900/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
        >
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">Stok Önerileri</h2>
              <span className={cn('text-xs font-medium', visibleSuggestions.length > 0 ? 'text-slate-400' : 'text-emerald-300')}>{visibleSuggestions.length} öneri</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">Mevcut stok, rezervasyon ve tüketim verilerine göre önerilen aksiyonlar.</p>
          </div>
          <ChevronDown className={cn('h-4 w-4 text-slate-500 transition-transform duration-150', !recommendationsOpen && '-rotate-90')} />
        </button>

        {recommendationsOpen && (
          <div>
            {loadingSuggestions ? (
              <div className="divide-y divide-slate-800/65">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="px-4 py-3"><div className="h-4 w-1/3 animate-pulse rounded bg-slate-800/80" /><div className="mt-2 h-3 w-1/5 animate-pulse rounded bg-slate-800/60" /></div>)}</div>
            ) : visibleSuggestions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-500">
                <span className="font-medium text-emerald-300">Kritik stok bulunmuyor.</span> Tüm ürünler minimum stok seviyelerinin üzerinde.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/65">
                {visibleSuggestions.slice(0, 5).map((suggestion) => (
                  <div key={`${suggestion.productId}-${suggestion.warehouseId}`} className={cn('grid gap-3 border-l-2 px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_110px_110px_130px] md:items-center', PRIORITY_CLASS[suggestion.priority])}>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-100">{suggestion.productName}</p>
                      <p className="truncate font-mono text-xs text-slate-500">{suggestion.productCode} · {suggestion.warehouseName}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                        <span className={cn('font-medium', PRIORITY_TEXT[suggestion.priority])}>{PRIORITY_LABEL[suggestion.priority]}</span>
                        <span className="text-slate-500">{VELOCITY_TREND_LABEL[suggestion.salesVelocity.trend]}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums text-slate-100">{formatQuantity(suggestion.suggestedQuantity)}</p>
                      <p className="text-[11px] text-slate-500">Önerilen</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium tabular-nums text-slate-300">{formatQuantity(suggestion.pendingReservationQty)}</p>
                      <p className="text-[11px] text-slate-500">{suggestion.reservationCount} rezervasyon</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium tabular-nums text-slate-300">{formatCurrency(suggestion.estimatedCost)}</p>
                      <p className="text-[11px] text-slate-500">{suggestion.estimatedDaysToStockout === null ? 'Tüketim yok' : `${suggestion.estimatedDaysToStockout} gün kapsama`}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-white">Stok Seviyeleri</h2>
          <p className="mt-0.5 text-xs text-slate-500">Depo bazında güncel miktar ve minimum stok karşılaştırması.</p>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-900/95">
                <tr className="border-b border-slate-800/80">
                  {['Ürün', 'Depo', 'Mevcut', 'Min. Stok', 'Fark', 'Durum', ''].map((header, index) => (
                    <th key={header || index} className={cn('px-4 py-3 text-left text-[11px] font-semibold uppercase text-slate-500', [2, 3, 4].includes(index) && 'text-right', index === 5 && 'text-center')}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? <TableSkeleton /> : filteredLevels.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <p className="text-sm font-semibold text-slate-200">Stok kaydı bulunmuyor</p>
                      <p className="mt-1 text-sm text-slate-500">Bu filtrelerle eşleşen stok kaydı bulunamadı.</p>
                      {hasFilters && <div className="mt-4"><Button size="sm" variant="secondary" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Filtreleri Temizle</Button></div>}
                    </td>
                  </tr>
                ) : filteredLevels.map((level) => {
                  const levelStatus = getStatus(level);
                  const deficit = getDeficit(level);
                  const min = Number(level.product?.minStockLevel ?? 0);
                  const quantity = Number(level.quantity);
                  const unit = level.product?.unit?.code ?? '';
                  const ratio = min > 0 ? Math.min(1, Math.max(0, quantity / min)) : 1;
                  return (
                    <tr
                      key={level.id}
                      tabIndex={0}
                      onClick={() => level.product?.id && router.push(`/dashboard/products/${level.product.id}`)}
                      onKeyDown={(event) => { if (event.key === 'Enter' && level.product?.id) router.push(`/dashboard/products/${level.product.id}`); }}
                      className="group cursor-pointer border-b border-slate-800/45 transition-colors duration-150 last:border-b-0 hover:bg-sky-500/[0.04] focus-visible:bg-sky-500/[0.06] focus-visible:outline-none"
                    >
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-slate-100">{level.product?.name ?? '-'}</p>
                        <p className="font-mono text-xs text-slate-500">{level.product?.code ?? ''}</p>
                      </td>
                      <td className="px-4 py-3.5 text-slate-400">{level.warehouse?.name ?? '-'}</td>
                      <td className="px-4 py-3.5 text-right">
                        <p className={cn('font-semibold tabular-nums', levelStatus === 'out' || levelStatus === 'critical' ? 'text-red-300' : levelStatus === 'low' ? 'text-amber-300' : 'text-slate-100')}>{formatQuantity(quantity)} {unit}</p>
                        <div className="ml-auto mt-1 h-1 w-14 overflow-hidden rounded-full bg-slate-800">
                          <div className={cn('h-full rounded-full', levelStatus === 'out' || levelStatus === 'critical' ? 'bg-red-400' : levelStatus === 'low' ? 'bg-amber-400' : 'bg-emerald-400')} style={{ width: `${ratio * 100}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-slate-500">{formatQuantity(min)} {unit}</td>
                      <td className={cn('px-4 py-3.5 text-right font-semibold tabular-nums', deficit < 0 ? (levelStatus === 'low' ? 'text-amber-300' : 'text-red-300') : 'text-emerald-300')}>
                        {deficit > 0 ? '+' : ''}{formatQuantity(deficit)}
                      </td>
                      <td className="px-4 py-3.5 text-center"><StatusBadge status={levelStatus} /></td>
                      <td className="w-10 px-4 py-3.5 text-right"><ChevronRight className="h-4 w-4 text-slate-600 opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {stockAlerts?.summary.alertCount !== undefined && stockAlerts.summary.alertCount > 0 && (
        <p className="text-xs text-slate-500">{stockAlerts.summary.alertCount} aktif stok alarmı dashboard izleme kapsamında.</p>
      )}
    </div>
  );
}
