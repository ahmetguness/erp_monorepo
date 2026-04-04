'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { InvoiceStatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { useInvoices } from '@/hooks/useSales';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Invoice, InvoiceType, InvoiceStatus } from '@/services/sales.service';

const TYPE_OPTIONS = [
  { value: '', label: 'Tüm Tipler' },
  { value: 'SALES', label: 'Satış' },
  { value: 'PURCHASE', label: 'Alış' },
  { value: 'RETURN_SALES', label: 'Satış İade' },
  { value: 'RETURN_PURCHASE', label: 'Alış İade' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Tüm Durumlar' },
  { value: 'DRAFT', label: 'Taslak' },
  { value: 'SENT', label: 'Gönderildi' },
  { value: 'PAID', label: 'Ödendi' },
  { value: 'PARTIALLY_PAID', label: 'Kısmi Ödeme' },
  { value: 'OVERDUE', label: 'Gecikmiş' },
  { value: 'CANCELLED', label: 'İptal' },
];

const TYPE_LABELS: Record<InvoiceType, string> = {
  SALES: 'Satış', PURCHASE: 'Alış', RETURN_SALES: 'Satış İade', RETURN_PURCHASE: 'Alış İade',
};

export function InvoicesListPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [type, setType] = useState<InvoiceType | ''>('');
  const [status, setStatus] = useState<InvoiceStatus | ''>('');

  const { data, isLoading } = useInvoices({ page, limit: 20, type: type || undefined, status: status || undefined });

  const columns: ColumnDef<Invoice>[] = [
    { key: 'number', header: 'No', width: '130px', render: (r) => <span className="font-mono text-sky-400">{r.number}</span> },
    { key: 'contact', header: 'Cari', render: (r) => <span className="text-slate-200">{r.contact?.name ?? '—'}</span> },
    { key: 'type', header: 'Tip', width: '100px', render: (r) => <Badge variant="neutral">{TYPE_LABELS[r.type]}</Badge> },
    { key: 'date', header: 'Tarih', width: '110px', render: (r) => <span className="text-slate-400">{formatDate(r.date)}</span> },
    { key: 'dueDate', header: 'Vade', width: '110px', render: (r) => <span className="text-slate-400">{r.dueDate ? formatDate(r.dueDate) : '—'}</span> },
    { key: 'status', header: 'Durum', width: '130px', render: (r) => <InvoiceStatusBadge status={r.status} /> },
    { key: 'totalGross', header: 'Toplam', width: '130px', align: 'right', render: (r) => <span className="font-semibold text-slate-200">{formatCurrency(r.totalGross)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Faturalar"
        subtitle="Satış ve alış faturalarınızı yönetin."
        action={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => router.push('/dashboard/invoices/new')}>Yeni Fatura</Button>}
      />
      <div className="flex flex-wrap gap-3 mb-4">
        <Select options={TYPE_OPTIONS} value={type} onChange={(e) => { setType(e.target.value as InvoiceType | ''); setPage(1); }} className="w-40" />
        <Select options={STATUS_OPTIONS} value={status} onChange={(e) => { setStatus(e.target.value as InvoiceStatus | ''); setPage(1); }} className="w-44" />
      </div>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        onRowClick={(r) => router.push(`/dashboard/invoices/${r.id}`)}
        emptyTitle="Fatura bulunamadı"
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />
    </div>
  );
}
