'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  Eye,
  FileText,
  Mail,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { RowActions, type RowAction } from '@/components/shared/RowActions';
import { SavedViewControls } from '@/components/shared/SavedViewControls';
import { QuoteStatusBadge } from '@/components/shared/StatusBadge';
import { SearchInput } from '@/components/shared/SearchInput';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { useSalesQuotes } from '@/hooks/useSales';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { SalesQuote, QuoteStatus } from '@/services/sales.service';
import { getSavedViewFilterString, type SavedViewState } from '@/services/saved-view.service';

const STATUS_OPTIONS: Array<{ value: QuoteStatus | ''; label: string }> = [
  { value: '', label: 'Tüm Durumlar' },
  { value: 'DRAFT', label: 'Taslak' },
  { value: 'SENT', label: 'Gönderildi' },
  { value: 'ACCEPTED', label: 'Kabul edildi' },
  { value: 'REJECTED', label: 'Reddedildi' },
  { value: 'EXPIRED', label: 'Süresi doldu' },
  { value: 'CANCELLED', label: 'İptal' },
];

const QUICK_STATUSES: Array<{ value: QuoteStatus | ''; label: string }> = [
  { value: '', label: 'Tümü' },
  { value: 'DRAFT', label: 'Taslak' },
  { value: 'SENT', label: 'Gönderildi' },
  { value: 'ACCEPTED', label: 'Kabul' },
  { value: 'REJECTED', label: 'Reddedildi' },
  { value: 'EXPIRED', label: 'Süresi doldu' },
];

function parseQuoteStatus(value: string): QuoteStatus | '' {
  if (
    value === 'DRAFT'
    || value === 'SENT'
    || value === 'ACCEPTED'
    || value === 'REJECTED'
    || value === 'EXPIRED'
    || value === 'CANCELLED'
  ) return value;
  return '';
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function ValidityBadge({ quote }: { quote: SalesQuote }) {
  const days = daysUntil(quote.validUntil);
  if (days === null) return <span className="text-xs text-slate-600">—</span>;

  let label = formatDate(quote.validUntil);
  let variant: BadgeVariant = 'neutral';

  if (quote.status === 'ACCEPTED') {
    label = 'Kabul edildi';
    variant = 'success';
  } else if (days < 0 || quote.status === 'EXPIRED') {
    label = 'Süresi geçti';
    variant = 'danger';
  } else if (days === 0) {
    label = 'Bugün bitiyor';
    variant = 'warning';
  } else if (days <= 7) {
    label = `${days} gün kaldı`;
    variant = 'warning';
  }

  return (
    <div className="flex flex-col gap-1">
      <Badge variant={variant}>{label}</Badge>
      <span className="text-[11px] text-slate-500">{formatDate(quote.validUntil)}</span>
    </div>
  );
}

function QuoteKpiCards({ quotes, total }: { quotes: SalesQuote[]; total: number }) {
  const sent = quotes.filter((quote) => quote.status === 'SENT').length;
  const accepted = quotes.filter((quote) => quote.status === 'ACCEPTED').length;
  const attention = quotes.filter((quote) => {
    const days = daysUntil(quote.validUntil);
    return quote.status === 'SENT' && days !== null && days <= 7;
  }).length;
  const gross = quotes.reduce((sum, quote) => sum + Number(quote.totalGross || 0), 0);

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] uppercase text-slate-500">Toplam teklif</p>
        <p className="mt-1 text-lg font-semibold text-white">{total}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] uppercase text-slate-500">Gönderilen</p>
        <p className="mt-1 text-lg font-semibold text-sky-300">{sent}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] uppercase text-slate-500">Takip gerektiren</p>
        <p className="mt-1 text-lg font-semibold text-amber-300">{attention}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] uppercase text-slate-500">Sayfa toplamı</p>
        <p className="mt-1 text-lg font-semibold text-emerald-300">{formatCurrency(gross)}</p>
      </div>
    </div>
  );
}

export function SalesQuotesListPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<QuoteStatus | ''>('');
  const [search, setSearch] = useState('');
  const { data, isLoading } = useSalesQuotes({
    page,
    limit: 20,
    status: status || undefined,
    search: search.trim() || undefined,
  });
  const quotes = data?.data ?? [];

  const viewState = useMemo<SavedViewState>(() => ({
    filters: { status, search },
    pageSize: 20,
  }), [search, status]);

  const applyView = (state: SavedViewState) => {
    setStatus(parseQuoteStatus(getSavedViewFilterString(state, 'status')));
    setSearch(getSavedViewFilterString(state, 'search'));
    setPage(1);
  };

  const setQuickStatus = (nextStatus: QuoteStatus | '') => {
    setStatus(nextStatus);
    setPage(1);
  };

  const getRowActions = (quote: SalesQuote): RowAction[] => [
    {
      label: 'Görüntüle',
      icon: <Eye className="h-4 w-4" />,
      onClick: () => router.push(`/dashboard/sales-orders/quotes/${quote.id}`),
    },
    {
      label: 'PDF / Önizleme',
      icon: <FileText className="h-4 w-4" />,
      onClick: () => router.push(`/dashboard/sales-orders/quotes/${quote.id}`),
    },
    {
      label: 'Mail gönder',
      icon: <Mail className="h-4 w-4" />,
      onClick: () => router.push(`/dashboard/sales-orders/quotes/${quote.id}`),
    },
    {
      label: 'Siparişe dönüştür',
      icon: <ArrowRight className="h-4 w-4" />,
      separator: true,
      onClick: () => router.push(`/dashboard/sales-orders/quotes/${quote.id}`),
    },
  ];

  const columns: ColumnDef<SalesQuote>[] = [
    {
      key: 'number',
      header: 'Teklif',
      width: '150px',
      render: (quote) => (
        <div>
          <span className="font-mono text-sm font-semibold text-sky-300">{quote.number}</span>
          <p className="mt-1 text-[11px] text-slate-500">{formatDate(quote.date)}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Cari',
      render: (quote) => (
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-200">{quote.contact?.name ?? '—'}</span>
          <span className="block truncate text-[11px] text-slate-500">{quote.contact?.email ?? `${quote.items?.length ?? 0} kalem`}</span>
        </div>
      ),
    },
    {
      key: 'validUntil',
      header: 'Geçerlilik',
      width: '140px',
      render: (quote) => <ValidityBadge quote={quote} />,
    },
    {
      key: 'status',
      header: 'Durum',
      width: '125px',
      render: (quote) => <QuoteStatusBadge status={quote.status} />,
    },
    {
      key: 'totalGross',
      header: 'Toplam',
      width: '150px',
      align: 'right',
      render: (quote) => (
        <div className="text-right">
          <span className="font-semibold text-slate-100">{formatCurrency(quote.totalGross)}</span>
          <p className="text-[11px] text-slate-500">KDV dahil</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '42px',
      align: 'center',
      hideable: false,
      render: (quote) => <RowActions actions={getRowActions(quote)} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Teklifler"
        subtitle="Müşterilerinize fiyat teklifi oluşturun. Kabul edilen teklifler siparişe dönüştürülebilir."
        action={
          <Link
            href="/dashboard/sales-orders/quotes/new"
            className="group relative inline-flex h-10 items-center gap-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-5 text-sm font-medium text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:from-sky-400 hover:to-sky-500 hover:shadow-sky-500/30 active:scale-[0.97]"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/15 transition-colors group-hover:bg-white/20">
              <Plus className="h-3.5 w-3.5" />
            </span>
            Yeni Teklif
          </Link>
        }
      />

      <QuoteKpiCards quotes={quotes} total={data?.meta.total ?? 0} />

      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK_STATUSES.map((option) => (
          <button
            key={option.value || 'all'}
            type="button"
            onClick={() => setQuickStatus(option.value)}
            className={`h-8 rounded-lg border px-3 text-xs font-medium transition-colors ${
              status === option.value
                ? 'border-sky-500/40 bg-sky-500/15 text-sky-200'
                : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(value) => setSearch(value)}
          placeholder="Teklif no veya cari adı ara..."
          className="w-72"
        />
        <Select
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => {
            setStatus(parseQuoteStatus(e.target.value));
            setPage(1);
          }}
          className="w-44"
        />
        <SavedViewControls module="sales" listKey="sales.quotes" currentState={viewState} onApply={applyView} />
      </div>

      {(status || search) && (
        <div className="mb-3 flex flex-wrap gap-2">
          {status && (
            <button
              type="button"
              onClick={() => setQuickStatus('')}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 text-xs font-medium text-sky-200 hover:border-sky-400/40"
            >
              {STATUS_OPTIONS.find((option) => option.value === status)?.label}
              <X className="h-3 w-3" />
            </button>
          )}
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 text-xs font-medium text-sky-200 hover:border-sky-400/40"
            >
              <Search className="h-3 w-3" />
              {search}
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      <DataTable
        columns={columns}
        data={quotes}
        keyExtractor={(quote) => quote.id}
        isLoading={isLoading}
        density="compact"
        onRowClick={(quote) => router.push(`/dashboard/sales-orders/quotes/${quote.id}`)}
        emptyTitle={search || status ? 'Filtreye uygun teklif bulunamadı' : 'Henüz teklif oluşturulmamış'}
        emptyDescription={search || status ? 'Arama veya durum filtresini temizleyerek tekrar deneyin.' : 'Yeni Teklif ile cari seçin, kalemleri ekleyin, geçerlilik tarihini belirleyin ve müşterinize gönderin.'}
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />

      {!isLoading && quotes.length === 0 && !search && !status && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
          <div className="mb-2 flex items-center gap-2 font-medium text-slate-200">
            <CalendarClock className="h-4 w-4 text-sky-300" />
            Teklif akışı
          </div>
          <p>Cari seç, teklif kalemlerini ekle, geçerlilik tarihini belirle ve kabul edilen teklifi siparişe dönüştür.</p>
        </div>
      )}
    </div>
  );
}
