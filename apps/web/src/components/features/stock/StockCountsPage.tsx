'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { useStockCounts } from '@/hooks/useStock';
import { formatDate } from '@/lib/utils';
import type { StockCount } from '@/services/stock.service';

export function StockCountsPage() {
  const router = useRouter();
  const { data: counts = [], isLoading } = useStockCounts();

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
      <PageHeader title="Stok Sayımları" subtitle="Fiziksel stok sayımlarını yönetin." />
      <DataTable
        columns={columns}
        data={counts}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        onRowClick={(r) => router.push(`/dashboard/stock/counts/${r.id}`)}
        emptyTitle="Henüz sayım yapılmamış"
      />
    </div>
  );
}
