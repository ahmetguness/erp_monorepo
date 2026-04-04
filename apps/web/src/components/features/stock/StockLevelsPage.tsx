'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useStockLevels } from '@/hooks/useStock';
import { useWarehouses } from '@/hooks/useStock';
import type { StockLevel } from '@/services/stock.service';

export function StockLevelsPage() {
  const [warehouseId, setWarehouseId] = useState('');
  const [belowMin, setBelowMin] = useState(false);

  const { data: warehouses = [] } = useWarehouses();
  const { data: levels = [], isLoading } = useStockLevels({
    warehouseId: warehouseId || undefined,
    belowMin: belowMin || undefined,
  });

  const warehouseOptions = [
    { value: '', label: 'Tüm Depolar' },
    ...warehouses.map((w) => ({ value: w.id, label: w.name })),
  ];

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
            {Number(r.quantity).toFixed(3)} {r.product?.unit?.code}
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

      <div className="flex flex-wrap gap-3 mb-4">
        <Select options={warehouseOptions} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-48" />
        <Button
          variant={belowMin ? 'danger' : 'ghost'}
          size="sm"
          leftIcon={<AlertTriangle className="w-3.5 h-3.5" />}
          onClick={() => setBelowMin((v) => !v)}
        >
          {belowMin ? 'Kritik Stok Gösteriliyor' : 'Kritik Stok'}
        </Button>
      </div>

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
