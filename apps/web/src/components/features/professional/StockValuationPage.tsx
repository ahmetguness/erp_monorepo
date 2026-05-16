'use client';

import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { ProductSelect } from '@/components/shared/EntitySelect';
import { useStockValuations } from '@/hooks/useStockValuation';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { StockValuation } from '@/services/stock-valuation.service';

export function StockValuationPage() {
  const [page, setPage] = useState(1);
  const [productId, setProductId] = useState('');
  const { data, isLoading } = useStockValuations({ page, limit: 20, productId: productId || undefined });

  const columns: ColumnDef<StockValuation>[] = [
    { key: 'date', header: 'Tarih', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.date)}</span> },
    { key: 'product', header: 'Ürün', render: (r) => (
      <div>
        <span className="text-white text-sm">{r.product?.name ?? '—'}</span>
        {r.product?.code && <span className="text-slate-500 text-xs ml-2">{r.product.code}</span>}
      </div>
    )},
    { key: 'qtyIn', header: 'Giriş', width: '90px', align: 'right', render: (r) => <span className="text-emerald-400 tabular-nums">{r.qtyIn > 0 ? `+${r.qtyIn}` : '—'}</span> },
    { key: 'qtyOut', header: 'Çıkış', width: '90px', align: 'right', render: (r) => <span className="text-red-400 tabular-nums">{r.qtyOut > 0 ? `-${r.qtyOut}` : '—'}</span> },
    { key: 'qtyBalance', header: 'Bakiye', width: '90px', align: 'right', render: (r) => <span className="text-white tabular-nums font-medium">{r.qtyBalance}</span> },
    { key: 'unitCost', header: 'Birim Maliyet', width: '130px', align: 'right', render: (r) => <span className="text-slate-300 tabular-nums">{formatCurrency(r.unitCost)}</span> },
    { key: 'totalValue', header: 'Toplam Değer', width: '130px', align: 'right', render: (r) => <span className="text-white tabular-nums font-medium">{formatCurrency(r.totalValue)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Stok Değerleme" subtitle="Ürün bazlı stok değerleme kayıtlarını inceleyin." />
      <div className="mb-4 max-w-xs">
        <ProductSelect label="" value={productId} onChange={(value) => { setProductId(value); setPage(1); }} />
      </div>
      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        emptyTitle="Değerleme kaydı bulunamadı" emptyDescription="Stok hareketleri oluştukça değerleme kayıtları otomatik oluşur."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />
    </div>
  );
}
