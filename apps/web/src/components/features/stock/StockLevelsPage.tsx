'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { WarehouseSelect } from '@/components/shared/EntitySelect';
import { useStockAlerts, useStockLevels, useStockReorderSuggestions } from '@/hooks/useStock';
import { cn, formatCurrency } from '@/lib/utils';
import type { StockLevel } from '@/services/stock.service';

export function StockLevelsPage() {
  const [warehouseId, setWarehouseId] = useState('');
  const [belowMin, setBelowMin] = useState(false);

  const { data: levels = [], isLoading } = useStockLevels({
    warehouseId: warehouseId || undefined,
    belowMin: belowMin || undefined,
  });
  const { data: reorderSuggestions = [] } = useStockReorderSuggestions();
  const { data: stockAlerts } = useStockAlerts(5);
  const visibleSuggestions = warehouseId
    ? reorderSuggestions.filter((suggestion) => suggestion.warehouseId === warehouseId)
    : reorderSuggestions;

  const columns: ColumnDef<StockLevel>[] = [
    {
      key: 'product', header: 'Ürün',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-200">{r.product?.name ?? '—'}</p>
          <p className="text-xs text-slate-500 font-mono">{r.product?.code}</p>
        </div>
      ),
    },
    { key: 'warehouse', header: 'Depo', width: '160px', render: (r) => <span className="text-slate-400">{r.warehouse?.name ?? '—'}</span> },
    {
      key: 'quantity', header: 'Miktar', width: '100px', align: 'right',
      render: (r) => {
        const isCritical = r.product && Number(r.quantity) < Number(r.product.minStockLevel);
        return (
          <span className={`font-medium ${isCritical ? 'text-red-400' : 'text-slate-200'}`}>
            {(() => { const v = Number(r.quantity); return Number.isInteger(v) ? v : v.toFixed(3); })()} {r.product?.unit?.code}
          </span>
        );
      },
    },
    {
      key: 'minStockLevel', header: 'Min. Stok', width: '100px', align: 'right',
      render: (r) => <span className="text-slate-500">{r.product?.minStockLevel ?? '—'}</span>,
    },
    {
      key: 'status', header: 'Durum', width: '100px', align: 'center',
      render: (r) => {
        const isCritical = r.product && Number(r.quantity) < Number(r.product.minStockLevel);
        return isCritical
          ? <span className="flex items-center justify-center gap-1 text-xs text-red-400"><AlertTriangle className="w-3 h-3" />Kritik</span>
          : <span className="text-xs text-emerald-400">Normal</span>;
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Stok Seviyeleri" subtitle="Ürünlerin depo bazlı stok durumu." />

      <div className="mb-4 rounded-lg border border-amber-500/15 bg-amber-500/5 px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
            <div>
              <p className="text-sm font-semibold text-slate-200">Basit stok alarmi</p>
              <p className="text-xs text-slate-500">Urun bazinda toplam stok minimum esigin altina dustugunde dashboard uyarisi olusur.</p>
            </div>
          </div>
          <span className="inline-flex h-8 items-center justify-center rounded-lg bg-amber-500/10 px-3 text-xs font-bold text-amber-300">
            {stockAlerts?.summary.alertCount ?? 0} aktif alarm
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <WarehouseSelect value={warehouseId} onChange={setWarehouseId} className="w-48" placeholder="Tüm depolar" />
        <button
          type="button"
          onClick={() => setBelowMin((v) => !v)}
          className={cn(
            'inline-flex items-center gap-2 h-8 px-3.5 rounded-lg text-xs font-medium transition-all duration-200',
            belowMin
              ? 'bg-red-500/15 text-red-400 border border-red-500/20 shadow-sm shadow-red-500/10 hover:bg-red-500/20'
              : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-amber-400 hover:border-amber-500/30 hover:bg-amber-500/5',
          )}
        >
          <AlertTriangle className={cn('w-3.5 h-3.5', belowMin ? 'text-red-400' : 'text-amber-500')} />
          {belowMin ? 'Kritik Stok Gösteriliyor' : 'Kritik Stok'}
          {belowMin && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          )}
        </button>
      </div>

      {visibleSuggestions.length > 0 && (
        <div className="mb-4 border border-amber-500/15 bg-amber-500/5 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-amber-500/10 flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-300 text-sm font-medium">
              <AlertTriangle className="w-4 h-4" />
              Satın alma önerileri
            </div>
            <span className="text-xs text-amber-200/70">{visibleSuggestions.length} kalem</span>
          </div>
          <div className="divide-y divide-amber-500/10">
            {visibleSuggestions.slice(0, 5).map((suggestion) => (
              <div key={`${suggestion.productId}-${suggestion.warehouseId}`} className="px-3 py-2 grid grid-cols-[minmax(0,1fr)_110px_120px] gap-3 items-center text-sm">
                <div className="min-w-0">
                  <p className="text-slate-200 truncate">{suggestion.productName}</p>
                  <p className="text-xs text-slate-500 font-mono truncate">{suggestion.productCode} · {suggestion.warehouseName}</p>
                </div>
                <div className="text-right">
                  <p className="text-amber-300 font-medium">{suggestion.suggestedQuantity}</p>
                  <p className="text-[11px] text-slate-500">önerilen</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-300">{formatCurrency(suggestion.estimatedCost)}</p>
                  <p className="text-[11px] text-slate-500">
                    {suggestion.estimatedDaysToStockout === null ? 'tüketim yok' : `${suggestion.estimatedDaysToStockout} gün`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={levels}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Stok kaydı bulunamadı"
      />
    </div>
  );
}
