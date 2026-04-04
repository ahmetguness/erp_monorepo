'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { PaymentStatusBadge } from '@/components/shared/StatusBadge';
import { usePayments } from '@/hooks/useAccounting';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Payment } from '@/services/accounting.service';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Nakit', BANK_TRANSFER: 'Havale/EFT', CREDIT_CARD: 'Kredi Kartı',
  CHECK: 'Çek', PROMISSORY_NOTE: 'Senet', OTHER: 'Diğer',
};

export function PaymentsListPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePayments({ page, limit: 20 });

  const columns: ColumnDef<Payment>[] = [
    { key: 'date', header: 'Tarih', width: '110px', render: (r) => <span className="text-slate-400">{formatDate(r.date)}</span> },
    { key: 'contact', header: 'Cari', render: (r) => <span className="text-slate-200">{r.contact?.name ?? '—'}</span> },
    { key: 'method', header: 'Yöntem', width: '130px', render: (r) => <span className="text-slate-400 text-sm">{METHOD_LABELS[r.method] ?? r.method}</span> },
    { key: 'account', header: 'Hesap', render: (r) => <span className="text-slate-400 text-sm">{r.bankAccount?.name ?? r.cashAccount?.name ?? '—'}</span> },
    { key: 'status', header: 'Durum', width: '120px', render: (r) => <PaymentStatusBadge status={r.status} /> },
    { key: 'amount', header: 'Tutar', width: '130px', align: 'right', render: (r) => <span className="font-semibold text-slate-200">{formatCurrency(r.amount)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Ödemeler" subtitle="Tahsilat ve ödeme kayıtlarını yönetin." />
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Ödeme kaydı bulunamadı"
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />
    </div>
  );
}
