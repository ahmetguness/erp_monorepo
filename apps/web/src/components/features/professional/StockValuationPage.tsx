'use client';

import { useMemo, useState } from 'react';
import { FilterX, Search, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ProductSelect, WarehouseSelect } from '@/components/shared/EntitySelect';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useStockValuations } from '@/hooks/useStockValuation';
import { cn, formatCurrency } from '@/lib/utils';
import type { StockValuation } from '@/services/stock-valuation.service';

type DatePreset = 'all' | 'today' | '7d' | '30d' | 'month';
type MovementFilter = 'all' | 'in' | 'out';

const PAGE_SIZE = 20;
const SUMMARY_LIMIT = 100;
const EMPTY_VALUATIONS: StockValuation[] = [];

function formatQty(value: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(value);
}

function formatLedgerDate(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function dateRangeForPreset(preset: DatePreset): { dateFrom?: string; dateTo?: string } {
  if (preset === 'all') return {};

  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (preset === '7d') start.setDate(start.getDate() - 7);
  if (preset === '30d') start.setDate(start.getDate() - 30);
  if (preset === 'month') start.setDate(1);

  return {
    dateFrom: start.toISOString(),
    dateTo: end.toISOString(),
  };
}

function movementType(row: StockValuation): Exclude<MovementFilter, 'all'> | 'neutral' {
  if (row.qtyIn > 0) return 'in';
  if (row.qtyOut > 0) return 'out';
  return 'neutral';
}

function MovementValue({ row }: { row: StockValuation }) {
  if (row.qtyIn > 0) {
    return <span className="tabular-nums text-emerald-300">+{formatQty(row.qtyIn)} AD</span>;
  }
  if (row.qtyOut > 0) {
    return <span className="tabular-nums text-red-300">-{formatQty(row.qtyOut)} AD</span>;
  }
  return <span className="text-slate-600">-</span>;
}

function SummarySkeleton() {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
      <div className="h-5 w-3/4 animate-pulse rounded bg-slate-800/80" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, row) => (
        <tr key={row} className="border-b border-slate-800/45 last:border-0">
          {Array.from({ length: 6 }).map((__, col) => (
            <td key={col} className="px-4 py-3.5">
              <div className="h-3.5 animate-pulse rounded bg-slate-800/75" style={{ width: `${44 + ((row + col) % 3) * 18}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function StockValuationPage() {
  const [page, setPage] = useState(1);
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [search, setSearch] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [movement, setMovement] = useState<MovementFilter>('all');
  const dateRange = useMemo(() => dateRangeForPreset(datePreset), [datePreset]);
  const queryParams = { productId: productId || undefined, warehouseId: warehouseId || undefined, ...dateRange };

  const { data, isLoading } = useStockValuations({ page, limit: PAGE_SIZE, ...queryParams });
  const { data: summaryData, isLoading: isSummaryLoading } = useStockValuations({ page: 1, limit: SUMMARY_LIMIT, ...queryParams });

  const rows = data?.data ?? EMPTY_VALUATIONS;
  const summaryRows = summaryData?.data ?? EMPTY_VALUATIONS;
  const q = search.trim().toLocaleLowerCase('tr-TR');

  const visibleRows = useMemo(() => rows.filter((row) => {
    const productText = `${row.product?.name ?? ''} ${row.product?.code ?? ''}`.toLocaleLowerCase('tr-TR');
    const matchesSearch = !q || productText.includes(q);
    const matchesMovement = movement === 'all' || movementType(row) === movement;
    return matchesSearch && matchesMovement;
  }), [movement, q, rows]);

  const currentByProduct = useMemo(() => {
    const map = new Map<string, StockValuation>();
    for (const row of summaryRows) {
      const key = `${row.productId}:${row.warehouseId}`;
      if (!map.has(key)) map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.totalValue - a.totalValue);
  }, [summaryRows]);

  const totalValue = currentByProduct.reduce((sum, row) => sum + row.totalValue, 0);
  const totalStock = currentByProduct.reduce((sum, row) => sum + row.qtyBalance, 0);
  const productCount = new Set(currentByProduct.map((row) => row.productId)).size;
  const warehouseCount = new Set(currentByProduct.map((row) => row.warehouseId)).size;
  const hasFilters = Boolean(productId || warehouseId || search || datePreset !== 'all' || movement !== 'all');
  const showDistribution = currentByProduct.length > 1;

  const clearFilters = () => {
    setProductId('');
    setWarehouseId('');
    setSearch('');
    setDatePreset('all');
    setMovement('all');
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stok Değerleme"
        subtitle="Stok maliyetlerini, envanter değerlerini ve değerleme hareketlerini inceleyin."
        className="mb-0"
      />

      {isSummaryLoading ? <SummarySkeleton /> : (
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="text-base font-semibold tabular-nums text-slate-50">{formatCurrency(totalValue)} <span className="text-[11px] font-medium uppercase text-slate-500">Toplam Stok Değeri</span></span>
            <span className="h-4 w-px bg-slate-800" />
            <span className="tabular-nums text-slate-200">{formatQty(totalStock)} AD <span className="text-[11px] font-medium uppercase text-slate-500">Stok</span></span>
            <span className="h-4 w-px bg-slate-800" />
            <span className="tabular-nums text-slate-200">{productCount} <span className="text-[11px] font-medium uppercase text-slate-500">Stok Kalemi</span></span>
            <span className="h-4 w-px bg-slate-800" />
            <span className="tabular-nums text-slate-200">{warehouseCount} <span className="text-[11px] font-medium uppercase text-slate-500">Depo</span></span>
          </div>
          {summaryData && summaryData.meta.total > SUMMARY_LIMIT && (
            <p className="mt-2 text-xs text-amber-300">Özet ilk {SUMMARY_LIMIT} değerleme kaydı üzerinden gösteriliyor; tam toplam için filtreleri daraltın.</p>
          )}
        </div>
      )}

      {showDistribution && (
        <section className="rounded-xl border border-slate-800/80 bg-slate-950/35 p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-sky-300" />
            <h2 className="text-sm font-semibold text-white">Mevcut Stok Değeri</h2>
          </div>
          <div className="space-y-3">
            {currentByProduct.slice(0, 5).map((row) => {
              const share = totalValue > 0 ? (row.totalValue / totalValue) * 100 : 0;
              return (
                <div key={`${row.productId}-${row.warehouseId}`} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{row.product?.name ?? 'Ürün bilgisi yok'}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">{row.product?.code ?? '-'} · {formatQty(row.qtyBalance)} AD x {formatCurrency(row.unitCost)}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800/90">
                      <div className="h-full rounded-full bg-sky-400/70" style={{ width: `${Math.min(100, share)}%` }} />
                    </div>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-sm font-semibold tabular-nums text-slate-50">{formatCurrency(row.totalValue)}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-slate-500">%{formatQty(share)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_220px_180px_150px_150px_auto] lg:items-center">
            <Input aria-label="Ürün adı veya kod ara" placeholder="Ürün adı veya kod ara..." value={search} onChange={(event) => setSearch(event.target.value)} prefixIcon={<Search className="h-4 w-4" />} />
            <ProductSelect value={productId} onChange={(value) => { setProductId(value); setPage(1); }} placeholder="Ürün seçin veya arayın..." />
            <WarehouseSelect value={warehouseId} onChange={(value) => { setWarehouseId(value); setPage(1); }} placeholder="Tüm Depolar" />
            <select value={datePreset} onChange={(event) => { setDatePreset(event.target.value as DatePreset); setPage(1); }} aria-label="Tarih filtresi" className="h-10 rounded-xl border border-slate-700/75 bg-slate-950/35 px-3.5 text-sm text-slate-200 outline-none transition-all duration-150 hover:border-slate-600/80 hover:bg-slate-900/60 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/35">
              <option value="today">Bugün</option>
              <option value="7d">Son 7 Gün</option>
              <option value="month">Bu Ay</option>
              <option value="30d">Son 30 Gün</option>
              <option value="all">Tüm Zamanlar</option>
            </select>
            <select value={movement} onChange={(event) => setMovement(event.target.value as MovementFilter)} aria-label="Hareket filtresi" className="h-10 rounded-xl border border-slate-700/75 bg-slate-950/35 px-3.5 text-sm text-slate-200 outline-none transition-all duration-150 hover:border-slate-600/80 hover:bg-slate-900/60 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/35">
              <option value="all">Tüm Hareketler</option>
              <option value="in">Giriş</option>
              <option value="out">Çıkış</option>
            </select>
            {hasFilters && <Button variant="ghost" size="sm" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Temizle</Button>}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
          <div className="border-b border-slate-800/70 bg-slate-900/45 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Değerleme Geçmişi</h2>
            <p className="mt-0.5 text-xs text-slate-500">Kayıtlar en yeni tarihten eskiye doğru listelenir.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-900/95">
                <tr className="border-b border-slate-800/80">
                  {['Tarih', 'Ürün', 'Hareket', 'Bakiye', 'Birim Maliyet', 'Stok Değeri'].map((header, index) => (
                    <th key={header} className={cn('px-4 py-3 text-left text-[11px] font-semibold uppercase text-slate-500', index >= 2 && 'text-right')}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? <TableSkeleton /> : visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center">
                      <p className="text-sm font-semibold text-slate-200">{hasFilters ? 'Bu filtreler için değerleme kaydı bulunamadı' : 'Değerleme kaydı bulunmuyor'}</p>
                      <p className="mt-1 text-sm text-slate-500">{hasFilters ? 'Farklı bir ürün, depo veya tarih aralığı seçin.' : 'Stok hareketleri oluştukça değerleme kayıtları burada görüntülenecek.'}</p>
                      {hasFilters && <Button className="mt-4" size="sm" variant="secondary" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Filtreleri Temizle</Button>}
                    </td>
                  </tr>
                ) : visibleRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-800/45 transition-colors duration-150 last:border-b-0 hover:bg-sky-500/[0.04]">
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-400">{formatLedgerDate(row.date)}</td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-100">{row.product?.name ?? 'Ürün bilgisi yok'}</p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">{row.product?.code ?? '-'}</p>
                    </td>
                    <td className="px-4 py-3.5 text-right"><MovementValue row={row} /></td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-slate-100">{formatQty(row.qtyBalance)} AD</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-slate-300">{formatCurrency(row.unitCost)}</td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-slate-50">{formatCurrency(row.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && data.meta.totalPages > 1 && (
            <div className="flex flex-col gap-3 border-t border-slate-800/70 bg-slate-900/45 px-4 py-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <span>{(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, data.meta.total)} / {data.meta.total} değerleme kaydı</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Önceki</Button>
                <span className="min-w-16 text-center tabular-nums text-slate-300">{page} / {data.meta.totalPages}</span>
                <Button size="sm" variant="secondary" disabled={page >= data.meta.totalPages} onClick={() => setPage((prev) => Math.min(data.meta.totalPages, prev + 1))}>Sonraki</Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
