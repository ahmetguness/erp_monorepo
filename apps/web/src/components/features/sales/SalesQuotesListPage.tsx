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
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { RowActions, type RowAction } from '@/components/shared/RowActions';
import { SavedViewControls } from '@/components/shared/SavedViewControls';
import { QuoteStatusBadge } from '@/components/shared/StatusBadge';
import { SearchInput } from '@/components/shared/SearchInput';
import { Select } from '@/components/ui/Select';
import { useSalesQuotes } from '@/hooks/useSales';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { SalesQuote, QuoteStatus, SalesQuoteSummary } from '@/services/sales.service';
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
  if (days === null) return <span className="text-xs text-slate-500 font-mono">—</span>;

  let label = `${days} gün kaldı`;
  let dotColor = 'bg-slate-400';
  let badgeStyle = 'border-slate-800 bg-slate-900/60 text-slate-300';

  if (days < 0 || quote.status === 'EXPIRED') {
    label = 'Süresi geçti';
    dotColor = 'bg-amber-400';
    badgeStyle = 'border-amber-500/20 bg-amber-500/10 text-amber-300';
  } else if (days === 0) {
    label = 'Bugün bitiyor';
    dotColor = 'bg-amber-400';
    badgeStyle = 'border-amber-500/20 bg-amber-500/10 text-amber-300';
  } else if (days <= 7) {
    label = `${days} gün kaldı`;
    dotColor = 'bg-amber-400';
    badgeStyle = 'border-amber-500/20 bg-amber-500/10 text-amber-300';
  } else {
    dotColor = 'bg-slate-500';
    badgeStyle = 'border-slate-800 bg-slate-900/40 text-slate-300';
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div>
        <span className={cn('inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium border', badgeStyle)}>
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dotColor)} />
          <span>{label}</span>
        </span>
      </div>
      <span className="text-[11px] text-slate-500 font-mono">{formatDate(quote.validUntil)}</span>
    </div>
  );
}

function QuoteKpiCards({ summary }: { summary: SalesQuoteSummary }) {
  const attentionCount = summary.attentionCount ?? 0;

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/60 shadow-sm">
      <div className="grid grid-cols-2 divide-y divide-slate-800/60 sm:grid-cols-4 sm:divide-y-0 sm:divide-x divide-slate-800/70">
        {/* Toplam Teklif */}
        <div className="flex flex-col justify-between p-3 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 truncate">
            Toplam Teklif
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-base sm:text-lg font-semibold text-slate-100 tabular-nums font-mono">
              {summary.total}
            </span>
            <span className="text-[11px] text-slate-500">teklif</span>
          </div>
        </div>

        {/* Gönderilen */}
        <div className="flex flex-col justify-between p-3 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 truncate">
            Gönderilen
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-base sm:text-lg font-semibold text-slate-100 tabular-nums font-mono">
              {summary.sentCount}
            </span>
            <span className="text-[11px] text-slate-500">müşteride</span>
          </div>
        </div>

        {/* Takip Gerektiren */}
        <div className="flex flex-col justify-between p-3 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 truncate">
            Takip Gerektiren
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span
              className={cn(
                'text-base sm:text-lg font-semibold tabular-nums font-mono',
                attentionCount > 0 ? 'text-amber-400' : 'text-slate-100',
              )}
            >
              {attentionCount}
            </span>
            <span className="text-[11px] text-slate-500">
              {attentionCount > 0 ? 'aksiyon bekliyor' : 'güncel'}
            </span>
          </div>
        </div>

        {/* Filtrelenmiş Toplam */}
        <div className="flex flex-col justify-between p-3 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 truncate">
            Filtrelenmiş Toplam
          </span>
          <div className="mt-1">
            <span className="text-base sm:text-lg font-semibold text-slate-100 tabular-nums font-mono">
              {formatCurrency(summary.totalGross)}
            </span>
            <span className="block text-[11px] text-slate-500">KDV dahil brüt</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SalesQuotesListPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<QuoteStatus | ''>('');
  const [search, setSearch] = useState('');
  const [tableDensity, setTableDensity] = useState<'comfortable' | 'compact'>('compact');

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
        <div className="min-w-0">
          <Link
            href={`/dashboard/sales-orders/quotes/${quote.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-xs sm:text-sm font-medium text-sky-400 hover:text-sky-300 hover:underline transition-colors block leading-tight truncate"
            title={quote.number}
          >
            {quote.number}
          </Link>
          <p className="mt-0.5 text-[11px] text-slate-500 font-mono">{formatDate(quote.date)}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Cari',
      render: (quote) => {
        const contactName = quote.contact?.name ?? '—';
        const itemCountText = quote.items !== undefined ? `${quote.items.length} kalem` : null;
        const secondaryText = itemCountText ?? quote.contact?.email ?? null;

        return (
          <div className="min-w-0">
            <span
              className="block truncate text-xs sm:text-sm font-medium text-slate-200 leading-tight"
              title={contactName}
            >
              {contactName}
            </span>
            {secondaryText && (
              <span
                className="block truncate text-[11px] text-slate-500 mt-0.5 font-mono"
                title={quote.contact?.email ?? undefined}
              >
                {secondaryText}
              </span>
            )}
          </div>
        );
      },
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
          <span className="font-mono text-xs sm:text-sm font-semibold tabular-nums text-slate-100">
            {formatCurrency(quote.totalGross)}
          </span>
          <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">KDV dahil</p>
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
      {/* 1. Standardized Compact Page Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Teklifler</h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Müşterilerinize fiyat teklifi oluşturun. Kabul edilen teklifler siparişe dönüştürülebilir.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/dashboard/sales-orders/quotes/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white px-3.5 text-xs font-medium shadow-sm transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <Plus className="w-3.5 h-3.5" />
            Yeni Teklif
          </Link>
        </div>
      </div>

      {/* 2. Unified KPI Summary Strip */}
      <QuoteKpiCards summary={data?.summary ?? { total: 0, sentCount: 0, attentionCount: 0, totalGross: 0 }} />

      {/* 3. Compact Segmented Status Tabs */}
      <div className="mb-2.5 flex items-center overflow-x-auto pb-0.5 sm:pb-0 scrollbar-none">
        <div className="inline-flex h-8 items-center rounded-lg border border-slate-800 bg-slate-900/60 p-0.5">
          {QUICK_STATUSES.map((option) => {
            const isActive = status === option.value;
            return (
              <button
                key={option.value || 'all'}
                type="button"
                onClick={() => setQuickStatus(option.value)}
                className={cn(
                  'h-7 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-500',
                  isActive
                    ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/60'
                    : 'text-slate-400 hover:text-slate-200',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Search and Filter Toolbar */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Teklif no veya cari adı ara..."
            className="w-64 sm:w-72"
            inputClassName="h-9 !py-1 text-xs rounded-lg border-slate-800 bg-slate-900/60"
          />
          <Select
            aria-label="Durum filtresi"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => {
              setStatus(parseQuoteStatus(e.target.value));
              setPage(1);
            }}
            className="w-40 h-9 !py-1 text-xs rounded-lg border-slate-800 bg-slate-900/60"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SavedViewControls
            module="sales"
            listKey="sales.quotes"
            currentState={viewState}
            onApply={applyView}
            controlSize="sm"
          />
          <div className="flex h-9 items-center rounded-lg border border-slate-800 bg-slate-900/60 p-0.5">
            <button
              type="button"
              onClick={() => setTableDensity('compact')}
              className={cn(
                'h-7 rounded-md px-2.5 text-xs font-medium transition-colors',
                tableDensity === 'compact'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              Kompakt
            </button>
            <button
              type="button"
              onClick={() => setTableDensity('comfortable')}
              className={cn(
                'h-7 rounded-md px-2.5 text-xs font-medium transition-colors',
                tableDensity === 'comfortable'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              Rahat
            </button>
          </div>
        </div>
      </div>

      {/* Active Filter Chips */}
      {(status || search) && (
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-500">Aktif filtreler:</span>
          {status && (
            <button
              type="button"
              onClick={() => setQuickStatus('')}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-slate-700 bg-slate-800/80 px-2 text-[11px] font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-800 transition-colors"
            >
              <span>{STATUS_OPTIONS.find((option) => option.value === status)?.label}</span>
              <X className="h-3 w-3 text-slate-400" />
            </button>
          )}
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPage(1);
              }}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-slate-700 bg-slate-800/80 px-2 text-[11px] font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-800 transition-colors"
            >
              <Search className="h-3 w-3 text-slate-400" />
              <span className="max-w-[140px] truncate">{search}</span>
              <X className="h-3 w-3 text-slate-400" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setStatus('');
              setSearch('');
              setPage(1);
            }}
            className="text-[11px] text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded transition-colors"
          >
            Temizle
          </button>
        </div>
      )}

      {/* 5. Quotations Table */}
      <DataTable
        columns={columns}
        data={quotes}
        keyExtractor={(quote) => quote.id}
        isLoading={isLoading}
        density={tableDensity}
        onRowClick={(quote) => router.push(`/dashboard/sales-orders/quotes/${quote.id}`)}
        emptyTitle={search || status ? 'Filtrelere uygun teklif bulunamadı' : 'Henüz teklif bulunmuyor.'}
        emptyDescription={
          search || status
            ? 'Arama veya durum filtresini temizleyerek tekrar deneyin.'
            : 'Yeni Teklif butonu ile cari seçin, kalemleri ekleyin ve müşterinize gönderin.'
        }
        pagination={
          data
            ? {
                page,
                pageSize: 20,
                total: data.meta.total,
                totalPages: data.meta.totalPages,
                onChange: setPage,
              }
            : undefined
        }
      />

      {/* Guided Helper for Initial Empty State */}
      {!isLoading && quotes.length === 0 && !search && !status && (
        <div className="mt-3 rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 text-xs text-slate-400">
          <div className="mb-1 flex items-center gap-2 font-medium text-slate-200 text-sm">
            <CalendarClock className="h-4 w-4 text-slate-400" />
            Teklif akışı
          </div>
          <p className="leading-relaxed">
            Cari seçin, teklif kalemlerini ekleyin, geçerlilik tarihini belirleyin ve kabul edilen teklifi tek tıkla siparişe dönüştürün.
          </p>
        </div>
      )}
    </div>
  );
}
