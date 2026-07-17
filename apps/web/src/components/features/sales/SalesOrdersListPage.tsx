'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ClipboardList,
  Eye,
  FileText,
  Mail,
  Plus,
  Receipt,
  Search,
  Truck,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { ListStandardControls } from '@/components/shared/ListStandardControls';
import { RowActions, type RowAction } from '@/components/shared/RowActions';
import { SearchInput } from '@/components/shared/SearchInput';
import { OrderStatusBadge } from '@/components/shared/StatusBadge';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useSalesOrders } from '@/hooks/useSales';
import { createListSavedViewState, getSavedViewPageSize, getVisibleColumns, normalizeColumnKeys } from '@/lib/list-standard';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { SalesOrder, OrderStatus } from '@/services/sales.service';
import { getSavedViewFilterString, type SavedViewState } from '@/services/saved-view.service';

const STATUS_OPTIONS: Array<{ value: OrderStatus | ''; label: string }> = [
  { value: '', label: 'Tüm Durumlar' },
  { value: 'DRAFT', label: 'Taslak' },
  { value: 'CONFIRMED', label: 'Onaylandı' },
  { value: 'PARTIALLY_DELIVERED', label: 'Kısmi Teslimat' },
  { value: 'DELIVERED', label: 'Teslim Edildi' },
  { value: 'CANCELLED', label: 'İptal' },
];

const QUICK_STATUSES: Array<{ value: OrderStatus | ''; label: string }> = [
  { value: '', label: 'Tümü' },
  { value: 'DRAFT', label: 'Taslak' },
  { value: 'CONFIRMED', label: 'Onaylandı' },
  { value: 'PARTIALLY_DELIVERED', label: 'Kısmi Teslimat' },
  { value: 'DELIVERED', label: 'Teslim Edildi' },
  { value: 'CANCELLED', label: 'İptal' },
];

const DEFAULT_PAGE_SIZE = 20;
const ORDER_COLUMN_KEYS = ['number', 'contact', 'dueDate', 'status', 'invoiceFlow', 'totalGross', 'actions'] as const;

function parseOrderStatus(value: string): OrderStatus | '' {
  if (
    value === 'DRAFT'
    || value === 'CONFIRMED'
    || value === 'PARTIALLY_DELIVERED'
    || value === 'DELIVERED'
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

function invoiceProgress(order: SalesOrder) {
  const total = Math.max(0, Number(order.totalGross) || 0);
  const invoiced = Math.max(0, Number(order.invoicedAmount) || 0);
  const remaining = Math.max(0, total - invoiced);
  const percent = total > 0 ? Math.min(100, Math.round((invoiced / total) * 100)) : 0;
  const complete = remaining <= 0;
  const partial = !complete && invoiced > 0;
  const label = complete ? 'Tamamlandı' : partial ? `%${percent} faturalandı` : 'Faturalanmadı';
  return { total, invoiced, remaining, percent, complete, partial, label };
}

function DueDateBadge({ order }: { order: SalesOrder }) {
  const days = daysUntil(order.dueDate);
  if (days === null) return <span className="text-xs text-slate-600">—</span>;

  let label = formatDate(order.dueDate);
  let variant: BadgeVariant = 'neutral';
  if (order.status !== 'DELIVERED' && order.status !== 'CANCELLED') {
    if (days < 0) {
      label = 'Gecikti';
      variant = 'danger';
    } else if (days === 0) {
      label = 'Bugün';
      variant = 'warning';
    } else if (days <= 7) {
      label = `${days} gün kaldı`;
      variant = 'warning';
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Badge variant={variant}>{label}</Badge>
      <span className="text-[11px] text-slate-500">{formatDate(order.dueDate)}</span>
    </div>
  );
}

function InvoiceProgressCell({ order }: { order: SalesOrder }) {
  const progress = invoiceProgress(order);
  return (
    <div className="min-w-32">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={progress.complete ? 'text-xs font-medium text-emerald-300' : 'text-xs font-medium text-amber-300'}>
          {progress.label}
        </span>
        <span className="text-[11px] text-slate-500">%{progress.percent}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={progress.complete ? 'h-full bg-emerald-400' : 'h-full bg-amber-400'}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      {!progress.complete && <p className="mt-1 text-[11px] text-slate-500">Kalan {formatCurrency(progress.remaining)}</p>}
    </div>
  );
}

function SalesOrderKpis({ orders, total }: { orders: SalesOrder[]; total: number }) {
  const confirmed = orders.filter((order) => order.status === 'CONFIRMED').length;
  const waitingDelivery = orders.filter((order) => order.status === 'CONFIRMED' || order.status === 'PARTIALLY_DELIVERED').length;
  const uninvoiced = orders.reduce((sum, order) => sum + invoiceProgress(order).remaining, 0);
  const gross = orders.reduce((sum, order) => sum + (Number(order.totalGross) || 0), 0);

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-5">
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] uppercase text-slate-500">Toplam sipariş</p>
        <p className="mt-1 text-lg font-semibold text-white">{total}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] uppercase text-slate-500">Onaylanan</p>
        <p className="mt-1 text-lg font-semibold text-sky-300">{confirmed}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] uppercase text-slate-500">Teslim bekleyen</p>
        <p className="mt-1 text-lg font-semibold text-amber-300">{waitingDelivery}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] uppercase text-slate-500">Faturalanmamış</p>
        <p className="mt-1 text-lg font-semibold text-red-300">{formatCurrency(uninvoiced)}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
        <p className="text-[10px] uppercase text-slate-500">Sayfa toplamı</p>
        <p className="mt-1 text-lg font-semibold text-emerald-300">{formatCurrency(gross)}</p>
      </div>
    </div>
  );
}

export function SalesOrdersListPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [search, setSearch] = useState('');
  const [tableDensity, setTableDensity] = useState<'comfortable' | 'compact'>('compact');
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>([...ORDER_COLUMN_KEYS]);

  const { data, isLoading } = useSalesOrders({
    page,
    limit: pageSize,
    status: status || undefined,
    search: search.trim() || undefined,
  });

  const orders = data?.data ?? [];
  const viewState = useMemo<SavedViewState>(() => createListSavedViewState({
    filters: { status, search, density: tableDensity },
    columns: visibleColumnKeys,
    pageSize,
  }), [pageSize, search, status, tableDensity, visibleColumnKeys]);

  const applyView = (state: SavedViewState) => {
    setStatus(parseOrderStatus(getSavedViewFilterString(state, 'status')));
    setSearch(getSavedViewFilterString(state, 'search'));
    const density = getSavedViewFilterString(state, 'density');
    setTableDensity(density === 'comfortable' ? 'comfortable' : 'compact');
    setPageSize(getSavedViewPageSize(state, DEFAULT_PAGE_SIZE));
    setVisibleColumnKeys(normalizeColumnKeys(columns, state.columns));
    setPage(1);
  };

  const setQuickStatus = (nextStatus: OrderStatus | '') => {
    setStatus(nextStatus);
    setPage(1);
  };

  const getRowActions = (order: SalesOrder): RowAction[] => [
    {
      label: 'Görüntüle',
      icon: <Eye className="h-4 w-4" />,
      onClick: () => router.push(`/dashboard/sales-orders/${order.id}`),
    },
    {
      label: 'Fatura oluştur',
      icon: <Receipt className="h-4 w-4" />,
      onClick: () => router.push(`/dashboard/invoices/new?salesOrderId=${order.id}`),
    },
    {
      label: 'Teslimat fişi',
      icon: <Truck className="h-4 w-4" />,
      onClick: () => router.push(`/dashboard/delivery-notes?salesOrderId=${order.id}`),
    },
    {
      label: 'Mail gönder',
      icon: <Mail className="h-4 w-4" />,
      separator: true,
      onClick: () => router.push(`/dashboard/sales-orders/${order.id}`),
    },
  ];

  const columns: ColumnDef<SalesOrder>[] = [
    {
      key: 'number',
      header: 'Sipariş',
      width: '150px',
      exportValue: (order) => order.number,
      render: (order) => (
        <div>
          <span className="font-mono text-sm font-semibold text-sky-300">{order.number}</span>
          <p className="mt-1 text-[11px] text-slate-500">{formatDate(order.date)}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Cari',
      exportValue: (order) => order.contact?.name ?? '',
      render: (order) => (
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-200">{order.contact?.name ?? '—'}</span>
          <span className="block truncate text-[11px] text-slate-500">
            {order.quoteId ? `Tekliften dönüştü` : invoiceProgress(order).label}
          </span>
        </div>
      ),
    },
    {
      key: 'dueDate',
      header: 'Vade',
      width: '130px',
      exportValue: (order) => order.dueDate ?? '',
      render: (order) => <DueDateBadge order={order} />,
    },
    {
      key: 'status',
      header: 'Durum',
      width: '145px',
      exportValue: (order) => order.status,
      render: (order) => <OrderStatusBadge status={order.status} />,
    },
    {
      key: 'invoiceFlow',
      header: 'Faturalama',
      width: '180px',
      exportValue: (order) => invoiceProgress(order).label,
      render: (order) => <InvoiceProgressCell order={order} />,
    },
    {
      key: 'totalGross',
      header: 'Toplam',
      width: '150px',
      align: 'right',
      exportValue: (order) => Number(order.totalGross) || 0,
      render: (order) => {
        const progress = invoiceProgress(order);
        return (
          <div className="text-right">
            <span className="font-semibold text-slate-100">{formatCurrency(order.totalGross)}</span>
            <p className="text-[11px] text-slate-500">Faturalanan {formatCurrency(progress.invoiced)}</p>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      width: '42px',
      align: 'center',
      hideable: false,
      render: (order) => <RowActions actions={getRowActions(order)} />,
    },
  ];
  const visibleColumns = getVisibleColumns(columns, visibleColumnKeys);

  return (
    <div>
      <PageHeader
        title="Satış Siparişleri"
        subtitle="Müşteri siparişlerinizi teslimat, faturalama ve tahsilat akışıyla takip edin."
        action={(
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/sales-orders/quotes" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 text-sm font-medium text-slate-300 hover:border-slate-700 hover:text-white">
              <FileText className="h-4 w-4" />
              Teklifler
            </Link>
            <Link href="/dashboard/sales-orders/new" className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white hover:bg-sky-500">
              <Plus className="h-4 w-4" />
              Yeni Sipariş
            </Link>
          </div>
        )}
      />

      <SalesOrderKpis orders={orders} total={data?.meta.total ?? 0} />

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
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Sipariş no veya cari adı ara..."
          className="w-72"
        />
        <Select
          options={STATUS_OPTIONS}
          value={status}
          onChange={(event) => setQuickStatus(parseOrderStatus(event.target.value))}
          className="w-48"
        />
        <ListStandardControls
          module="sales"
          listKey="sales.orders"
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
          exportRows={orders}
          exportFilename="satis-siparisleri.csv"
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

      <DataTable
        columns={visibleColumns}
        data={orders}
        keyExtractor={(order) => order.id}
        isLoading={isLoading}
        density={tableDensity}
        onRowClick={(order) => router.push(`/dashboard/sales-orders/${order.id}`)}
        emptyTitle={search || status ? 'Filtreye uygun sipariş bulunamadı' : 'Sipariş bulunamadı'}
        emptyDescription={search || status ? 'Arama veya durum filtresini temizleyerek tekrar deneyin.' : 'Tekliften siparişe dönüştürün veya yeni satış siparişi oluşturun.'}
        pagination={data ? { page, pageSize, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />

      {!isLoading && orders.length === 0 && !search && !status && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
          <div className="mb-2 flex items-center gap-2 font-medium text-slate-200">
            <ClipboardList className="h-4 w-4 text-sky-300" />
            Satış siparişi akışı
          </div>
          <p>Tekliften sipariş oluşturun, teslimatı takip edin ve faturalanmamış tutarları kapatın.</p>
        </div>
      )}
    </div>
  );
}
