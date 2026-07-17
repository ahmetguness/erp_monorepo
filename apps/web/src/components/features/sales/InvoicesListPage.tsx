'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CreditCard,
  Eye,
  FileText,
  Mail,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { BulkActionBar } from '@/components/shared/BulkActionBar';
import { createBulkActionPresets } from '@/components/shared/bulkActionPresets';
import { ListStandardControls } from '@/components/shared/ListStandardControls';
import { RowActions, type RowAction } from '@/components/shared/RowActions';
import { SearchInput } from '@/components/shared/SearchInput';
import { InvoiceStatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { SalesConversionFlowCard } from '@/components/features/sales/SalesConversionFlowCard';
import { useCurrentUser } from '@/hooks/useAuth';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { useInvoices } from '@/hooks/useSales';
import { useUIStore } from '@/store/ui.store';
import { formatCurrency, formatDate } from '@/lib/utils';
import { createListSavedViewState, getSavedViewPageSize, getVisibleColumns, normalizeColumnKeys } from '@/lib/list-standard';
import type { Invoice, InvoiceType, InvoiceStatus } from '@/services/sales.service';
import { getSavedViewFilterString, type SavedViewState } from '@/services/saved-view.service';

const TYPE_OPTIONS: Array<{ value: InvoiceType | ''; label: string }> = [
  { value: '', label: 'Tüm Tipler' },
  { value: 'SALES', label: 'Satış' },
  { value: 'PURCHASE', label: 'Alış' },
  { value: 'RETURN_SALES', label: 'Satış İade' },
  { value: 'RETURN_PURCHASE', label: 'Alış İade' },
];

const STATUS_OPTIONS: Array<{ value: InvoiceStatus | ''; label: string }> = [
  { value: '', label: 'Tüm Durumlar' },
  { value: 'DRAFT', label: 'Taslak' },
  { value: 'SENT', label: 'Gönderildi' },
  { value: 'PAID', label: 'Ödendi' },
  { value: 'PARTIALLY_PAID', label: 'Kısmi Ödeme' },
  { value: 'OVERDUE', label: 'Gecikmiş' },
  { value: 'CANCELLED', label: 'İptal' },
];

const QUICK_STATUSES: Array<{ value: InvoiceStatus | ''; label: string }> = [
  { value: '', label: 'Tümü' },
  { value: 'DRAFT', label: 'Taslak' },
  { value: 'SENT', label: 'Gönderildi' },
  { value: 'PAID', label: 'Ödendi' },
  { value: 'PARTIALLY_PAID', label: 'Kısmi' },
  { value: 'OVERDUE', label: 'Gecikmiş' },
  { value: 'CANCELLED', label: 'İptal' },
];

const QUICK_TYPES: Array<{ value: InvoiceType | ''; label: string }> = [
  { value: '', label: 'Tüm Tipler' },
  { value: 'SALES', label: 'Satış' },
  { value: 'PURCHASE', label: 'Alış' },
  { value: 'RETURN_SALES', label: 'Satış İade' },
  { value: 'RETURN_PURCHASE', label: 'Alış İade' },
];

const TYPE_LABELS: Record<InvoiceType, string> = {
  SALES: 'Satış',
  PURCHASE: 'Alış',
  RETURN_SALES: 'Satış İade',
  RETURN_PURCHASE: 'Alış İade',
};

const TYPE_VARIANTS: Record<InvoiceType, BadgeVariant> = {
  SALES: 'info',
  PURCHASE: 'purple',
  RETURN_SALES: 'warning',
  RETURN_PURCHASE: 'neutral',
};

const DEFAULT_PAGE_SIZE = 20;
const INVOICE_COLUMN_KEYS = ['number', 'contact', 'type', 'dueDate', 'status', 'paymentState', 'totalGross', 'actions'] as const;

function parseInvoiceType(value: string): InvoiceType | '' {
  if (value === 'SALES' || value === 'PURCHASE' || value === 'RETURN_SALES' || value === 'RETURN_PURCHASE') return value;
  return '';
}

function parseInvoiceStatus(value: string): InvoiceStatus | '' {
  if (
    value === 'DRAFT'
    || value === 'SENT'
    || value === 'PAID'
    || value === 'PARTIALLY_PAID'
    || value === 'OVERDUE'
    || value === 'CANCELLED'
  ) return value;
  return '';
}

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function dueDateState(invoice: Invoice): { label: string; variant: BadgeVariant; urgent: boolean } {
  if (invoice.status === 'PAID') return { label: 'Ödendi', variant: 'success', urgent: false };
  if (invoice.status === 'CANCELLED') return { label: 'İptal', variant: 'neutral', urgent: false };
  const days = daysUntil(invoice.dueDate);
  if (days === null) return { label: 'Vade yok', variant: 'neutral', urgent: false };
  if (days < 0 || invoice.status === 'OVERDUE') return { label: 'Gecikti', variant: 'danger', urgent: true };
  if (days === 0) return { label: 'Bugün', variant: 'warning', urgent: true };
  if (days <= 7) return { label: `${days} gün kaldı`, variant: 'warning', urgent: true };
  return { label: `${days} gün kaldı`, variant: 'neutral', urgent: false };
}

function paymentState(invoice: Invoice): { label: string; percent: number; variant: BadgeVariant; openAmount: number } {
  const total = Math.max(0, Number(invoice.totalGross) || 0);
  if (invoice.status === 'PAID') return { label: 'Ödendi', percent: 100, variant: 'success', openAmount: 0 };
  if (invoice.status === 'PARTIALLY_PAID') return { label: 'Kısmi ödeme', percent: 50, variant: 'warning', openAmount: total };
  if (invoice.status === 'CANCELLED') return { label: 'İptal', percent: 0, variant: 'neutral', openAmount: 0 };
  if (invoice.status === 'OVERDUE') return { label: 'Gecikmiş açık', percent: 0, variant: 'danger', openAmount: total };
  return { label: 'Açık', percent: 0, variant: 'warning', openAmount: total };
}

function DueDateBadge({ invoice }: { invoice: Invoice }) {
  const state = dueDateState(invoice);
  return (
    <div className="flex flex-col gap-1">
      <Badge variant={state.variant}>{state.label}</Badge>
      <span className="text-[11px] text-slate-500">{invoice.dueDate ? formatDate(invoice.dueDate) : '—'}</span>
    </div>
  );
}

function PaymentStateCell({ invoice }: { invoice: Invoice }) {
  const state = paymentState(invoice);
  return (
    <div className="min-w-28">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-300">{state.label}</span>
        <span className="text-[11px] text-slate-500">%{state.percent}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={state.variant === 'success' ? 'h-full bg-emerald-400' : state.variant === 'danger' ? 'h-full bg-red-400' : 'h-full bg-amber-400'}
          style={{ width: `${state.percent}%` }}
        />
      </div>
      {state.openAmount > 0 && <p className="mt-1 text-[11px] text-slate-500">Açık {formatCurrency(state.openAmount)}</p>}
    </div>
  );
}

function InvoiceKpis({ invoices, total }: { invoices: Invoice[]; total: number }) {
  const paid = invoices.filter((invoice) => invoice.status === 'PAID').length;
  const overdue = invoices.filter((invoice) => invoice.status === 'OVERDUE' || dueDateState(invoice).label === 'Gecikti').length;
  const openAmount = invoices.reduce((sum, invoice) => sum + paymentState(invoice).openAmount, 0);
  const gross = invoices.reduce((sum, invoice) => sum + (Number(invoice.totalGross) || 0), 0);

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-5">
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] uppercase text-slate-500">Toplam fatura</p>
        <p className="mt-1 text-lg font-semibold text-white">{total}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] uppercase text-slate-500">Ödenmiş</p>
        <p className="mt-1 text-lg font-semibold text-emerald-300">{paid}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] uppercase text-slate-500">Gecikmiş</p>
        <p className="mt-1 text-lg font-semibold text-red-300">{overdue}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] uppercase text-slate-500">Açık tutar</p>
        <p className="mt-1 text-lg font-semibold text-amber-300">{formatCurrency(openAmount)}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] uppercase text-slate-500">Sayfa toplamı</p>
        <p className="mt-1 text-lg font-semibold text-sky-300">{formatCurrency(gross)}</p>
      </div>
    </div>
  );
}

export function InvoicesListPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { toast } = useUIStore();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [type, setType] = useState<InvoiceType | ''>('');
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const [search, setSearch] = useState('');
  const [tableDensity, setTableDensity] = useState<'comfortable' | 'compact'>('compact');
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>([...INVOICE_COLUMN_KEYS]);

  const { data, isLoading } = useInvoices({
    page,
    limit: pageSize,
    type: type || undefined,
    status: status || undefined,
    search: search.trim() || undefined,
  });
  const invoices = data?.data ?? [];
  const bulkSelection = useBulkSelection(invoices.map((invoice) => invoice.id));
  const viewState = useMemo<SavedViewState>(() => createListSavedViewState({
    filters: { type, status, search, density: tableDensity },
    columns: visibleColumnKeys,
    pageSize,
  }), [pageSize, search, status, tableDensity, type, visibleColumnKeys]);

  const applyView = (state: SavedViewState) => {
    setType(parseInvoiceType(getSavedViewFilterString(state, 'type')));
    setStatus(parseInvoiceStatus(getSavedViewFilterString(state, 'status')));
    setSearch(getSavedViewFilterString(state, 'search'));
    const density = getSavedViewFilterString(state, 'density');
    setTableDensity(density === 'comfortable' ? 'comfortable' : 'compact');
    setPageSize(getSavedViewPageSize(state, DEFAULT_PAGE_SIZE));
    setVisibleColumnKeys(normalizeColumnKeys(columns, state.columns));
    setPage(1);
  };

  const setQuickStatus = (nextStatus: InvoiceStatus | '') => {
    setStatus(nextStatus);
    setPage(1);
  };

  const setQuickType = (nextType: InvoiceType | '') => {
    setType(nextType);
    setPage(1);
  };

  const getRowActions = (invoice: Invoice): RowAction[] => [
    {
      label: 'Görüntüle',
      icon: <Eye className="h-4 w-4" />,
      onClick: () => router.push(`/dashboard/invoices/${invoice.id}`),
    },
    {
      label: 'PDF / Yazdır',
      icon: <Printer className="h-4 w-4" />,
      onClick: () => router.push(`/dashboard/invoices/${invoice.id}`),
    },
    {
      label: 'Mail gönder',
      icon: <Mail className="h-4 w-4" />,
      onClick: () => router.push(`/dashboard/invoices/${invoice.id}`),
    },
    {
      label: invoice.type === 'SALES' ? 'Ödeme al' : 'Ödeme yap',
      icon: <CreditCard className="h-4 w-4" />,
      separator: true,
      onClick: () => router.push(`/dashboard/payments/new?invoiceId=${invoice.id}`),
    },
  ];

  const columns: ColumnDef<Invoice>[] = [
    {
      key: 'number',
      header: 'Fatura',
      width: '150px',
      exportValue: (invoice) => invoice.number,
      render: (invoice) => (
        <div>
          <span className="font-mono text-sm font-semibold text-sky-300">{invoice.number}</span>
          <p className="mt-1 text-[11px] text-slate-500">{formatDate(invoice.date)}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Cari',
      exportValue: (invoice) => invoice.contact?.name ?? '',
      render: (invoice) => (
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-200">{invoice.contact?.name ?? '—'}</span>
          <span className="block truncate text-[11px] text-slate-500">{invoice.contact?.taxNumber ?? invoice.contact?.email ?? invoice.currencyCode}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Tip',
      width: '115px',
      exportValue: (invoice) => TYPE_LABELS[invoice.type],
      render: (invoice) => <Badge variant={TYPE_VARIANTS[invoice.type]}>{TYPE_LABELS[invoice.type]}</Badge>,
    },
    {
      key: 'dueDate',
      header: 'Vade',
      width: '130px',
      exportValue: (invoice) => invoice.dueDate ?? '',
      render: (invoice) => <DueDateBadge invoice={invoice} />,
    },
    {
      key: 'status',
      header: 'Durum',
      width: '130px',
      exportValue: (invoice) => invoice.status,
      render: (invoice) => <InvoiceStatusBadge status={invoice.status} />,
    },
    {
      key: 'paymentState',
      header: 'Ödeme',
      width: '160px',
      exportValue: (invoice) => paymentState(invoice).label,
      render: (invoice) => <PaymentStateCell invoice={invoice} />,
    },
    {
      key: 'totalGross',
      header: 'Toplam',
      width: '150px',
      align: 'right',
      exportValue: (invoice) => Number(invoice.totalGross) || 0,
      render: (invoice) => (
        <div className="text-right">
          <span className="font-semibold text-slate-100">{formatCurrency(invoice.totalGross)}</span>
          <p className="text-[11px] text-slate-500">{invoice.currencyCode}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '42px',
      align: 'center',
      hideable: false,
      render: (invoice) => <RowActions actions={getRowActions(invoice)} />,
    },
  ];
  const visibleColumns = getVisibleColumns(columns, visibleColumnKeys);

  const bulkActions = createBulkActionPresets({
    module: 'invoicing',
    entityName: 'fatura',
    notify: toast.info,
    include: ['export', 'mail', 'tag', 'status', 'task', 'archive'],
  });

  return (
    <div>
      <PageHeader
        title="Faturalar"
        subtitle="Satış ve alış faturalarınızı ödeme, vade ve belge akışıyla yönetin."
        action={(
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/sales-orders" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 text-sm font-medium text-slate-300 hover:border-slate-700 hover:text-white">
              <ShoppingCart className="h-4 w-4" />
              Satış Siparişleri
            </Link>
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => router.push('/dashboard/invoices/new')}>
              Hızlı Fatura
            </Button>
          </div>
        )}
      />

      <SalesConversionFlowCard stage="invoice" compact />

      <InvoiceKpis invoices={invoices} total={data?.meta.total ?? 0} />

      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK_STATUSES.map((option) => (
          <button
            key={option.value || 'all-status'}
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

      <div className="mb-4 flex flex-wrap gap-2">
        {QUICK_TYPES.map((option) => (
          <button
            key={option.value || 'all-type'}
            type="button"
            onClick={() => setQuickType(option.value)}
            className={`h-8 rounded-lg border px-3 text-xs font-medium transition-colors ${
              type === option.value
                ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
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
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Fatura no veya cari adı ara..."
          className="w-72"
        />
        <Select options={TYPE_OPTIONS} value={type} onChange={(event) => setQuickType(parseInvoiceType(event.target.value))} className="w-40" />
        <Select options={STATUS_OPTIONS} value={status} onChange={(event) => setQuickStatus(parseInvoiceStatus(event.target.value))} className="w-44" />
        <ListStandardControls
          module="sales"
          listKey="sales.invoices"
          currentState={viewState}
          onApplyView={applyView}
          columns={columns}
          visibleColumnKeys={visibleColumnKeys}
          onVisibleColumnKeysChange={setVisibleColumnKeys}
          pageSize={pageSize}
          onPageSizeChange={(nextPageSize) => {
            setPageSize(nextPageSize);
            setPage(1);
          }}
          exportRows={invoices}
          exportFilename="faturalar.csv"
        />
        <div className="flex rounded-lg border border-slate-800 bg-slate-900/60 p-0.5">
          <button
            type="button"
            onClick={() => setTableDensity('compact')}
            className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${tableDensity === 'compact' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Kompakt
          </button>
          <button
            type="button"
            onClick={() => setTableDensity('comfortable')}
            className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${tableDensity === 'comfortable' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Rahat
          </button>
        </div>
      </div>

      {(type || status || search) && (
        <div className="mb-3 flex flex-wrap gap-2">
          {type && (
            <button type="button" onClick={() => setQuickType('')} className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-violet-500/25 bg-violet-500/10 px-2.5 text-xs font-medium text-violet-200 hover:border-violet-400/40">
              {TYPE_OPTIONS.find((option) => option.value === type)?.label}
              <X className="h-3 w-3" />
            </button>
          )}
          {status && (
            <button type="button" onClick={() => setQuickStatus('')} className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 text-xs font-medium text-sky-200 hover:border-sky-400/40">
              {STATUS_OPTIONS.find((option) => option.value === status)?.label}
              <X className="h-3 w-3" />
            </button>
          )}
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPage(1);
              }}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 text-xs font-medium text-sky-200 hover:border-sky-400/40"
            >
              <Search className="h-3 w-3" />
              {search}
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      <BulkActionBar
        selectedIds={bulkSelection.selectedIdList}
        actions={bulkActions}
        user={user}
        onClear={bulkSelection.clearSelection}
      />

      <DataTable
        columns={visibleColumns}
        data={invoices}
        keyExtractor={(invoice) => invoice.id}
        selection={{
          selectedIds: bulkSelection.selectedIds,
          isPageSelected: bulkSelection.isPageSelected,
          isPagePartiallySelected: bulkSelection.isPagePartiallySelected,
          onToggleRow: bulkSelection.toggleOne,
          onTogglePage: bulkSelection.togglePage,
        }}
        isLoading={isLoading}
        density={tableDensity}
        onRowClick={(invoice) => router.push(`/dashboard/invoices/${invoice.id}`)}
        emptyTitle={type || status || search ? 'Filtreye uygun fatura bulunamadı' : 'Fatura bulunamadı'}
        emptyDescription={type || status || search ? 'Arama veya filtreleri temizleyerek tekrar deneyin.' : 'Yeni fatura oluşturun veya satış siparişinden fatura kesin.'}
        pagination={data ? { page, pageSize, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />

      {!isLoading && invoices.length === 0 && !type && !status && !search && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
          <div className="mb-2 flex items-center gap-2 font-medium text-slate-200">
            <FileText className="h-4 w-4 text-sky-300" />
            Fatura akışı
          </div>
          <p>Satış siparişinden fatura kesin, cari borç/alacak takibini güncel tutun ve ödeme durumunu buradan izleyin.</p>
        </div>
      )}
    </div>
  );
}
