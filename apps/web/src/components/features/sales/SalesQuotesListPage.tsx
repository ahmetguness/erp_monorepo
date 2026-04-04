'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { QuoteStatusBadge } from '@/components/shared/StatusBadge';
import { useSalesQuotes } from '@/hooks/useSales';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { SalesQuote } from '@/services/sales.service';

export function SalesQuotesListPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSalesQuotes({ page, limit: 20 });

  const columns: ColumnDef<SalesQuote>[] = [
    { key: 'number', header: 'No', width: '120px', render: (r) => <span className="font-mono text-sky-400">{r.number}</span> },
    { key: 'contact', header: 'Cari', render: (r) => <span className="text-slate-200">{r.contact?.name ?? '—'}</span> },
    { key: 'date', header: 'Tarih', width: '110px', render: (r) => <span className="text-slate-400">{formatDate(r.date)}</span> },
    { key: 'validUntil', header: 'Geçerlilik', width: '110px', render: (r) => <span className="text-slate-400">{r.validUntil ? formatDate(r.validUntil) : '—'}</span> },
    { key: 'status', header: 'Durum', width: '120px', render: (r) => <QuoteStatusBadge status={r.status} /> },
    { key: 'totalGross', header: 'Toplam', width: '130px', align: 'right', render: (r) => <span className="font-semibold text-slate-200">{formatCurrency(r.totalGross)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Teklifler"
        subtitle="Müşterilerinize fiyat teklifi oluşturun. Kabul edilen teklifler siparişe dönüştürülebilir."
        action={
          <Link
            href="/dashboard/sales-orders/quotes/new"
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white
                       bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500
                       shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30
                       transition-all duration-200 active:scale-[0.97]"
          >
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15 group-hover:bg-white/20 transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </span>
            Yeni Teklif
          </Link>
        }
      />
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        onRowClick={(r) => router.push(`/dashboard/sales-orders/quotes/${r.id}`)}
        emptyTitle="Henüz teklif oluşturulmamış"
        emptyDescription="Yeni bir teklif oluşturarak müşterilerinize fiyat sunun."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />
    </div>
  );
}
