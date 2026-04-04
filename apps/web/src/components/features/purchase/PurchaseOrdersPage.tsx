'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { usePurchaseOrders } from '@/hooks/usePurchase';
import { cn, formatDate, formatCurrency } from '@/lib/utils';
import type { PurchaseOrder } from '@/services/purchase.service';

const STATUS_MAP: Record<string, { label: string; variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  DRAFT: { label: 'Taslak', variant: 'warning' },
  SENT: { label: 'Gönderildi', variant: 'info' },
  PARTIALLY_RECEIVED: { label: 'Kısmi Teslim', variant: 'warning' },
  RECEIVED: { label: 'Teslim Alındı', variant: 'success' },
  CANCELLED: { label: 'İptal', variant: 'neutral' },
};

export function PurchaseOrdersPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePurchaseOrders({ page, limit: 20 });

  const columns: ColumnDef<PurchaseOrder>[] = [
    { key: 'number', header: 'No', width: '120px', render: (r) => <span className="font-mono text-sky-400">{r.number}</span> },
    { key: 'contact', header: 'Tedarikçi', render: (r) => <span className="text-slate-200">{r.contact?.name ?? '—'}</span> },
    { key: 'date', header: 'Tarih', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.date)}</span> },
    { key: 'items', header: 'Kalem', width: '70px', align: 'center', render: (r) => <span className="text-slate-300">{r._count?.items ?? 0}</span> },
    { key: 'status', header: 'Durum', width: '130px',
      render: (r) => { const s = STATUS_MAP[r.status]; return s ? <Badge variant={s.variant}>{s.label}</Badge> : <span>{r.status}</span>; } },
    { key: 'totalGross', header: 'Toplam', width: '130px', align: 'right',
      render: (r) => <span className="font-semibold text-white tabular-nums">{formatCurrency(r.totalGross)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Satın Alma Siparişleri" subtitle="Tedarikçi siparişlerini yönetin."
        action={
          <Link href="/dashboard/purchase-orders/new"
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 transition-all duration-200 active:scale-[0.97]">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15"><Plus className="w-3.5 h-3.5" /></span>
            Yeni Sipariş
          </Link>
        }
      />
      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        onRowClick={(r) => router.push(`/dashboard/purchase-orders/${r.id}`)}
        emptyTitle="Satın alma siparişi bulunamadı" emptyDescription="Yeni bir sipariş oluşturarak başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />
    </div>
  );
}
