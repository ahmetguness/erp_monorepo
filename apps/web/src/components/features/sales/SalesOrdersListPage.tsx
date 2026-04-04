'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { OrderStatusBadge } from '@/components/shared/StatusBadge';
import { Select } from '@/components/ui/Select';
import { useSalesOrders } from '@/hooks/useSales';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { SalesOrder, OrderStatus } from '@/services/sales.service';

const STATUS_OPTIONS = [
  { value: '', label: 'Tüm Durumlar' },
  { value: 'DRAFT', label: 'Taslak' },
  { value: 'CONFIRMED', label: 'Onaylandı' },
  { value: 'PARTIALLY_DELIVERED', label: 'Kısmi Teslimat' },
  { value: 'DELIVERED', label: 'Teslim Edildi' },
  { value: 'CANCELLED', label: 'İptal' },
];

export function SalesOrdersListPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const { data, isLoading } = useSalesOrders({ page, limit: 20, status: status || undefined });

  const columns: ColumnDef<SalesOrder>[] = [
    { key: 'number', header: 'No', width: '120px', render: (r) => <span className="font-mono text-sky-400">{r.number}</span> },
    { key: 'contact', header: 'Cari', render: (r) => <span className="text-slate-200">{r.contact?.name ?? '—'}</span> },
    { key: 'date', header: 'Tarih', width: '110px', render: (r) => <span className="text-slate-400">{formatDate(r.date)}</span> },
    { key: 'dueDate', header: 'Vade', width: '110px', render: (r) => <span className="text-slate-400">{r.dueDate ? formatDate(r.dueDate) : '—'}</span> },
    { key: 'status', header: 'Durum', width: '140px', render: (r) => <OrderStatusBadge status={r.status} /> },
    { key: 'totalGross', header: 'Toplam', width: '130px', align: 'right', render: (r) => <span className="font-semibold text-slate-200">{formatCurrency(r.totalGross)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Satış Siparişleri" subtitle="Müşteri siparişlerinizi takip edin." />
      <div className="mb-4">
        <Select
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => { setStatus(e.target.value as OrderStatus | ''); setPage(1); }}
          className="w-48"
        />
      </div>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        onRowClick={(r) => router.push(`/dashboard/sales-orders/${r.id}`)}
        emptyTitle="Sipariş bulunamadı"
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />
    </div>
  );
}
