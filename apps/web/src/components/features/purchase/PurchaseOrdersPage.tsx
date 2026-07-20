'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, ClipboardList, Eye, FileDown, FilterX, PackageCheck, Plus, Printer, Search, Send, ShoppingCart, Truck, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { RowActions, type RowAction } from '@/components/shared/RowActions';
import { ContactSelect } from '@/components/shared/EntitySelect';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { usePurchaseOrders } from '@/hooks/usePurchase';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { PurchaseOrder, PurchaseOrderStatus } from '@/services/purchase.service';

const STATUS_MAP: Record<PurchaseOrderStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: 'Taslak', variant: 'warning' },
  SENT: { label: 'Gönderildi', variant: 'info' },
  PARTIALLY_RECEIVED: { label: 'Kısmi teslim', variant: 'warning' },
  RECEIVED: { label: 'Teslim alındı', variant: 'success' },
  CANCELLED: { label: 'İptal', variant: 'neutral' },
};

const STATUS_OPTIONS: Array<{ value: PurchaseOrderStatus | ''; label: string }> = [
  { value: '', label: 'Tüm Durumlar' },
  ...Object.entries(STATUS_MAP).map(([value, meta]) => ({ value: value as PurchaseOrderStatus, label: meta.label })),
];

const QUICK_STATUSES: Array<{ value: PurchaseOrderStatus | ''; label: string }> = [
  { value: '', label: 'Tümü' },
  { value: 'DRAFT', label: 'Taslak' },
  { value: 'SENT', label: 'Gönderilen' },
  { value: 'PARTIALLY_RECEIVED', label: 'Kısmi' },
  { value: 'RECEIVED', label: 'Teslim' },
];

function parseStatus(value: string): PurchaseOrderStatus | '' {
  return value in STATUS_MAP ? value as PurchaseOrderStatus : '';
}

function receiveProgress(order: PurchaseOrder): { ordered: number; received: number; percent: number; label: string; variant: BadgeVariant } {
  const items = order.items ?? [];
  const ordered = items.reduce((sum, item) => sum + Number(item.quantity), 0);
  const received = items.reduce((sum, item) => sum + Number(item.received), 0);
  const percent = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0;
  const variant: BadgeVariant = percent >= 100 ? 'success' : percent > 0 ? 'warning' : 'neutral';
  return { ordered, received, percent, label: ordered > 0 ? `${received}/${ordered}` : `${order._count?.items ?? 0} kalem`, variant };
}

function dueState(order: PurchaseOrder): { label: string; variant: BadgeVariant; urgent: boolean } {
  if (order.status === 'RECEIVED') return { label: 'Tamamlandı', variant: 'success', urgent: false };
  if (order.status === 'CANCELLED') return { label: 'İptal', variant: 'neutral', urgent: false };
  if (!order.dueDate) return { label: 'Vade yok', variant: 'neutral', urgent: false };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(order.dueDate); due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: `${Math.abs(days)} gün gecikti`, variant: 'danger', urgent: true };
  if (days <= 3) return { label: days === 0 ? 'Bugün vade' : `${days} gün kaldı`, variant: 'warning', urgent: true };
  return { label: `${days} gün kaldı`, variant: 'info', urgent: false };
}

function KpiCard({ label, value, detail, icon: Icon, tone = 'neutral' }: { label: string; value: string; detail: string; icon: typeof ShoppingCart; tone?: BadgeVariant }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">{value}</p>
        </div>
        <div className={cn('rounded-lg border p-2', tone === 'success' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : tone === 'warning' ? 'border-amber-500/20 bg-amber-500/10 text-amber-300' : tone === 'danger' ? 'border-red-500/20 bg-red-500/10 text-red-300' : 'border-sky-500/20 bg-sky-500/10 text-sky-300')}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export function PurchaseOrdersPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PurchaseOrderStatus | ''>('');
  const [contactId, setContactId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [minTotal, setMinTotal] = useState('');
  const [maxTotal, setMaxTotal] = useState('');
  const [tableDensity, setTableDensity] = useState<'comfortable' | 'compact'>('compact');
  const { data, isLoading } = usePurchaseOrders({
    page,
    limit: pageSize,
    search: search || undefined,
    status: status || undefined,
    contactId: contactId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    dueFrom: dueFrom || undefined,
    dueTo: dueTo || undefined,
    minTotal: minTotal || undefined,
    maxTotal: maxTotal || undefined,
  });
  const orders = data?.data ?? [];

  const kpis = useMemo(() => ({
    total: data?.meta.total ?? 0,
    draft: orders.filter((order) => order.status === 'DRAFT').length,
    sent: orders.filter((order) => order.status === 'SENT').length,
    partial: orders.filter((order) => order.status === 'PARTIALLY_RECEIVED').length,
    received: orders.filter((order) => order.status === 'RECEIVED').length,
    amount: orders.reduce((sum, order) => sum + order.totalGross, 0),
  }), [data?.meta.total, orders]);

  const riskCount = orders.filter((order) => dueState(order).urgent || order.status === 'PARTIALLY_RECEIVED').length;
  const activeFilters = [
    status && `Durum: ${STATUS_MAP[status].label}`,
    contactId && 'Tedarikçi seçili',
    search && `Arama: ${search}`,
    dateFrom && `Sipariş başlangıç: ${formatDate(dateFrom)}`,
    dateTo && `Sipariş bitiş: ${formatDate(dateTo)}`,
    dueFrom && `Vade başlangıç: ${formatDate(dueFrom)}`,
    dueTo && `Vade bitiş: ${formatDate(dueTo)}`,
    minTotal && `Min: ${formatCurrency(Number(minTotal))}`,
    maxTotal && `Max: ${formatCurrency(Number(maxTotal))}`,
  ].filter((item): item is string => Boolean(item));

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setContactId('');
    setDateFrom('');
    setDateTo('');
    setDueFrom('');
    setDueTo('');
    setMinTotal('');
    setMaxTotal('');
    setPage(1);
  };

  const exportCsv = () => {
    const header = ['No', 'Tedarikçi', 'Tarih', 'Vade', 'Durum', 'Toplam'];
    const rows = orders.map((order) => [order.number, order.contact?.name ?? '', formatDate(order.date), formatDate(order.dueDate), STATUS_MAP[order.status].label, String(order.totalGross)]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'purchase-orders.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const getRowActions = (order: PurchaseOrder): RowAction[] => [
    { label: 'Görüntüle', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/dashboard/purchase-orders/${order.id}`) },
    { label: 'PDF / Yazdır', icon: <Printer className="h-4 w-4" />, onClick: () => window.print() },
    ...(order.status === 'DRAFT' ? [{ label: 'Tedarikçiye gönder', icon: <Send className="h-4 w-4" />, onClick: () => router.push(`/dashboard/purchase-orders/${order.id}`), separator: true }] : []),
    ...(order.status !== 'RECEIVED' && order.status !== 'CANCELLED' ? [{ label: 'Teslim al', icon: <PackageCheck className="h-4 w-4" />, onClick: () => router.push(`/dashboard/purchase-orders/${order.id}`) }] : []),
    ...(order.status !== 'CANCELLED' ? [{ label: 'İptal et', icon: <XCircle className="h-4 w-4" />, variant: 'danger' as const, onClick: () => router.push(`/dashboard/purchase-orders/${order.id}`), separator: true }] : []),
  ];

  const columns: ColumnDef<PurchaseOrder>[] = [
    { key: 'number', header: 'Sipariş', width: '150px', exportValue: (order) => order.number, render: (order) => <div><button type="button" className="font-mono text-sky-400 hover:underline" onClick={(event) => { event.stopPropagation(); router.push(`/dashboard/purchase-orders/${order.id}`); }}>{order.number}</button><p className="mt-1 text-xs text-slate-500">{formatDate(order.date)}</p></div> },
    { key: 'contact', header: 'Tedarikçi', exportValue: (order) => order.contact?.name, render: (order) => <div><p className="text-sm text-slate-200">{order.contact?.name ?? 'Tedarikçi yok'}</p><p className="text-xs text-slate-500">{order.contact?.code ?? 'Kod yok'} · {order.currencyCode}</p></div> },
    { key: 'due', header: 'Vade', width: '135px', exportValue: (order) => formatDate(order.dueDate), render: (order) => { const due = dueState(order); return <div><Badge variant={due.variant}>{due.label}</Badge><p className="mt-1 text-xs text-slate-500">{formatDate(order.dueDate)}</p></div>; } },
    { key: 'receive', header: 'Teslim', width: '165px', render: (order) => { const progress = receiveProgress(order); return <div><div className="flex items-center justify-between gap-2 text-xs"><span className="text-slate-400">{progress.label}</span><Badge variant={progress.variant}>%{progress.percent}</Badge></div><div className="mt-2 h-1.5 rounded-full bg-slate-800"><div className="h-1.5 rounded-full bg-emerald-400" style={{ width: `${progress.percent}%` }} /></div></div>; } },
    { key: 'status', header: 'Durum', width: '145px', exportValue: (order) => STATUS_MAP[order.status].label, render: (order) => <Badge variant={STATUS_MAP[order.status].variant} dot>{STATUS_MAP[order.status].label}</Badge> },
    { key: 'totalGross', header: 'Toplam', width: '145px', align: 'right', exportValue: (order) => order.totalGross, render: (order) => <span className="font-semibold text-white tabular-nums">{formatCurrency(order.totalGross, order.currencyCode)}</span> },
    { key: 'actions', header: '', width: '72px', align: 'right', hideable: false, render: (order) => <RowActions actions={getRowActions(order)} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Satın Alma Siparişleri"
        subtitle="Tedarikçi siparişlerini, teslimat risklerini ve satın alma tutarlarını yönetin."
        action={
          <Link href="/dashboard/purchase-orders/new">
            <Button leftIcon={<Plus className="h-4 w-4" />}>Yeni sipariş</Button>
          </Link>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <KpiCard label="Toplam" value={String(kpis.total)} detail="Filtre sonucu" icon={ShoppingCart} />
        <KpiCard label="Taslak" value={String(kpis.draft)} detail="Gönderim bekliyor" icon={ClipboardList} tone="warning" />
        <KpiCard label="Gönderilen" value={String(kpis.sent)} detail="Tedarikçide" icon={Send} />
        <KpiCard label="Kısmi" value={String(kpis.partial)} detail="Teslimat sürüyor" icon={Truck} tone="warning" />
        <KpiCard label="Teslim" value={String(kpis.received)} detail="Kapanan sipariş" icon={PackageCheck} tone="success" />
        <KpiCard label="Tutar" value={formatCurrency(kpis.amount)} detail="Bu sayfadaki toplam" icon={FileDown} />
      </div>

      {riskCount > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <p className="text-sm font-semibold text-amber-100">Teslimat kontrolü gerekiyor</p>
              <p className="mt-1 text-sm text-amber-100/80">{riskCount} siparişte gecikme, yakın vade veya kısmi teslimat riski var.</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_180px_220px_150px_150px]">
          <Input placeholder="Sipariş no, tedarikçi, ürün, not ara..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} prefixIcon={<Search className="h-4 w-4" />} />
          <Select label="" options={STATUS_OPTIONS} value={status} onChange={(event) => { setStatus(parseStatus(event.target.value)); setPage(1); }} />
          <ContactSelect label="" placeholder="Tedarikçi filtrele..." type={['SUPPLIER', 'BOTH']} value={contactId} onChange={(value) => { setContactId(value); setPage(1); }} />
          <Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} />
          <Input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[150px_150px_140px_140px_minmax(0,1fr)]">
          <Input type="date" value={dueFrom} onChange={(event) => { setDueFrom(event.target.value); setPage(1); }} />
          <Input type="date" value={dueTo} onChange={(event) => { setDueTo(event.target.value); setPage(1); }} />
          <Input type="number" placeholder="Min tutar" value={minTotal} onChange={(event) => { setMinTotal(event.target.value); setPage(1); }} />
          <Input type="number" placeholder="Max tutar" value={maxTotal} onChange={(event) => { setMaxTotal(event.target.value); setPage(1); }} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Select aria-label="Sayfa boyutu" options={[20, 50, 100].map((value) => ({ value: String(value), label: `${value} / sayfa` }))} value={String(pageSize)} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="w-32" />
            <Button variant={tableDensity === 'compact' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTableDensity('compact')}>Sıkı</Button>
            <Button variant={tableDensity === 'comfortable' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTableDensity('comfortable')}>Rahat</Button>
            <Button variant="outline" size="sm" leftIcon={<FileDown className="h-3.5 w-3.5" />} disabled={orders.length === 0} onClick={exportCsv}>Dışa aktar</Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_STATUSES.map((item) => (
            <button key={item.value || 'all'} type="button" onClick={() => { setStatus(item.value); setPage(1); }} className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors', status === item.value ? 'border-sky-500/40 bg-sky-500/15 text-sky-200' : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200')}>
              {item.label}
            </button>
          ))}
        </div>
        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
            {activeFilters.map((filter) => <Badge key={filter} variant="neutral">{filter}</Badge>)}
            <Button variant="ghost" size="sm" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Temizle</Button>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={orders}
        keyExtractor={(order) => order.id}
        isLoading={isLoading}
        onRowClick={(order) => router.push(`/dashboard/purchase-orders/${order.id}`)}
        emptyTitle="Satın alma siparişi bulunamadı"
        emptyDescription="Yeni sipariş oluşturun veya satın alma taleplerinden siparişe dönüştürün."
        pagination={data ? { page, pageSize, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
        density={tableDensity}
      />

      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/purchase-orders/requests">
          <Button variant="outline" size="sm" leftIcon={<ArrowRight className="h-3.5 w-3.5" />}>Taleplerden sipariş oluştur</Button>
        </Link>
      </div>
    </div>
  );
}
