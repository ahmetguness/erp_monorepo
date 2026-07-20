'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle, ArrowRight, CheckCircle, ClipboardCheck, ClipboardList, Eye, FileDown,
  FilterX, Package, Plus, Save, Search, ShoppingCart, Trash2, TrendingDown, X,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { RowActions, type RowAction } from '@/components/shared/RowActions';
import { ContactSelect, ProductSelect } from '@/components/shared/EntitySelect';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { compareSupplierQuotes, type QuoteComparisonResult, type SupplierQuoteDraft } from '@/components/features/purchase/purchase-quote-comparison';
import { useApprovePurchaseRequest, useConvertRequestToOrder, useCreatePurchaseRequest, usePurchaseRequests } from '@/hooks/usePurchase';
import { useProducts } from '@/hooks/useProducts';
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { PurchaseRequest, PurchaseRequestStatus } from '@/services/purchase.service';

const STATUS_MAP: Record<PurchaseRequestStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: 'Taslak', variant: 'warning' },
  PENDING_APPROVAL: { label: 'Onay bekliyor', variant: 'info' },
  APPROVED: { label: 'Onaylı', variant: 'success' },
  REJECTED: { label: 'Reddedildi', variant: 'danger' },
  ORDERED: { label: 'Sipariş verildi', variant: 'neutral' },
  CANCELLED: { label: 'İptal', variant: 'neutral' },
};

const STATUS_OPTIONS: Array<{ value: PurchaseRequestStatus | ''; label: string }> = [
  { value: '', label: 'Tüm Durumlar' },
  ...Object.entries(STATUS_MAP).map(([value, meta]) => ({ value: value as PurchaseRequestStatus, label: meta.label })),
];

const QUICK_STATUSES: Array<{ value: PurchaseRequestStatus | ''; label: string }> = [
  { value: '', label: 'Tümü' },
  { value: 'DRAFT', label: 'Taslak' },
  { value: 'PENDING_APPROVAL', label: 'Onay' },
  { value: 'APPROVED', label: 'Onaylı' },
  { value: 'ORDERED', label: 'Sipariş' },
];

const itemSchema = z.object({
  productId: z.string().min(1, 'Ürün seçiniz'),
  quantity: z.string().min(1, 'Zorunlu'),
  unitPrice: z.string().optional(),
});

const requestSchema = z.object({
  date: z.string().min(1, 'Tarih zorunlu'),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, 'En az bir kalem'),
});

type RequestForm = z.infer<typeof requestSchema>;

function createEmptySupplierQuote(): SupplierQuoteDraft {
  return { contactId: '', prices: {}, leadTimeDays: '', qualityScore: '' };
}

function parseStatus(value: string): PurchaseRequestStatus | '' {
  return value in STATUS_MAP ? value as PurchaseRequestStatus : '';
}

function requestTotal(request: PurchaseRequest): number {
  if (request.totalEstimated !== null) return request.totalEstimated;
  return (request.items ?? []).reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice ?? 0), 0);
}

function requestFlags(request: PurchaseRequest): string[] {
  const flags: string[] = [];
  if ((request.items ?? []).length === 0) flags.push('Kalem yok');
  if ((request.items ?? []).some((item) => !item.unitPrice || Number(item.unitPrice) <= 0)) flags.push('Fiyat eksik');
  if ((request.items ?? []).some((item) => Number(item.quantity) <= 0)) flags.push('Miktar hatalı');
  if (!request.notes) flags.push('Not yok');
  return flags;
}

function flowStepStatus(request: PurchaseRequest, step: 'request' | 'approval' | 'quote' | 'order'): BadgeVariant {
  if (request.status === 'CANCELLED' || request.status === 'REJECTED') return 'neutral';
  if (step === 'request') return 'success';
  if (step === 'approval') return request.status === 'DRAFT' || request.status === 'PENDING_APPROVAL' ? 'warning' : 'success';
  if (step === 'quote') return request.status === 'APPROVED' ? 'warning' : request.status === 'ORDERED' ? 'success' : 'neutral';
  return request.status === 'ORDERED' ? 'success' : 'neutral';
}

function KpiCard({ label, value, detail, icon: Icon, tone = 'neutral' }: { label: string; value: string; detail: string; icon: typeof ClipboardList; tone?: BadgeVariant }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">{value}</p>
        </div>
        <div className={cn('rounded-lg border p-2', tone === 'success' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : tone === 'warning' ? 'border-amber-500/20 bg-amber-500/10 text-amber-300' : 'border-sky-500/20 bg-sky-500/10 text-sky-300')}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function DetailModal({ request, onClose, onApprove, onCompare, onConvert }: {
  request: PurchaseRequest | null;
  onClose: () => void;
  onApprove: (request: PurchaseRequest) => void;
  onCompare: (request: PurchaseRequest) => void;
  onConvert: (request: PurchaseRequest) => void;
}) {
  if (!request) return null;
  const flags = requestFlags(request);

  return (
    <Modal isOpen={!!request} onClose={onClose} title={`Talep ${request.number}`} size="xl" footer={<Button variant="ghost" size="sm" onClick={onClose}>Kapat</Button>}>
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-500">Durum</p><Badge variant={STATUS_MAP[request.status].variant}>{STATUS_MAP[request.status].label}</Badge></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-500">Tarih</p><p className="text-sm text-slate-200">{formatDate(request.date)}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-500">Tahmini toplam</p><p className="text-sm font-semibold text-slate-100">{requestTotal(request) > 0 ? formatCurrency(requestTotal(request)) : 'Yok'}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-500">Onay tarihi</p><p className="text-sm text-slate-200">{formatDateTime(request.approvedAt)}</p></div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-sm font-semibold text-slate-200">Süreç</h3>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {[
              { key: 'request' as const, label: 'Talep' },
              { key: 'approval' as const, label: 'Onay' },
              { key: 'quote' as const, label: 'Teklif' },
              { key: 'order' as const, label: 'Sipariş' },
            ].map((step, index) => (
              <div key={step.key} className="flex items-center gap-2">
                <Badge variant={flowStepStatus(request, step.key)}>{step.label}</Badge>
                {index < 3 && <ArrowRight className="h-3.5 w-3.5 text-slate-600" />}
              </div>
            ))}
          </div>
          {request.purchaseOrder && (
            <p className="mt-3 text-sm text-slate-400">Bağlı sipariş: <span className="font-mono text-sky-300">{request.purchaseOrder.number}</span></p>
          )}
        </div>

        {flags.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <div>
                <p className="text-sm font-semibold text-amber-100">Talep kontrolü</p>
                <div className="mt-2 flex flex-wrap gap-2">{flags.map((flag) => <Badge key={flag} variant="warning">{flag}</Badge>)}</div>
              </div>
            </div>
          </div>
        )}

        <DataTable
          columns={[
            { key: 'product', header: 'Ürün', render: (item) => <div><p className="text-slate-200">{item.product?.name ?? item.description ?? item.productId}</p><p className="text-xs text-slate-500">{item.product?.code ?? item.description}</p></div> },
            { key: 'quantity', header: 'Miktar', width: '100px', align: 'right', render: (item) => <span className={Number(item.quantity) <= 0 ? 'font-medium text-red-300' : 'text-slate-300'}>{item.quantity}</span> },
            { key: 'unitPrice', header: 'Tahmini fiyat', width: '140px', align: 'right', render: (item) => <span className={item.unitPrice ? 'text-slate-300' : 'text-amber-300'}>{item.unitPrice ? formatCurrency(Number(item.unitPrice)) : 'Eksik'}</span> },
            { key: 'lineTotal', header: 'Tutar', width: '140px', align: 'right', render: (item) => <span className="font-medium text-slate-100">{formatCurrency(Number(item.quantity) * Number(item.unitPrice ?? 0))}</span> },
          ]}
          data={request.items ?? []}
          keyExtractor={(item) => item.id}
          emptyTitle="Kalem bulunamadı"
          emptyDescription="Bu talepte ürün satırı yok."
          density="compact"
        />

        {request.notes && <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">{request.notes}</div>}

        <div className="flex flex-wrap justify-end gap-2">
          {(request.status === 'DRAFT' || request.status === 'PENDING_APPROVAL') && <Button size="sm" leftIcon={<CheckCircle className="h-3.5 w-3.5" />} onClick={() => onApprove(request)}>Onayla</Button>}
          {request.status === 'APPROVED' && <Button variant="outline" size="sm" leftIcon={<TrendingDown className="h-3.5 w-3.5" />} onClick={() => onCompare(request)}>Teklif karşılaştır</Button>}
          {request.status === 'APPROVED' && <Button size="sm" leftIcon={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => onConvert(request)}>Siparişe dönüştür</Button>}
        </div>
      </div>
    </Modal>
  );
}

export function PurchaseRequestsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PurchaseRequestStatus | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minTotal, setMinTotal] = useState('');
  const [maxTotal, setMaxTotal] = useState('');
  const [tableDensity, setTableDensity] = useState<'comfortable' | 'compact'>('compact');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<PurchaseRequest | null>(null);
  const [approveTarget, setApproveTarget] = useState<PurchaseRequest | null>(null);
  const [convertTarget, setConvertTarget] = useState<PurchaseRequest | null>(null);
  const [convertContactId, setConvertContactId] = useState('');
  const [compareTarget, setCompareTarget] = useState<PurchaseRequest | null>(null);
  const [orderConfirm, setOrderConfirm] = useState<{ request: PurchaseRequest; quote: SupplierQuoteDraft; result: QuoteComparisonResult } | null>(null);
  const [supplierQuotes, setSupplierQuotes] = useState<SupplierQuoteDraft[]>([createEmptySupplierQuote(), createEmptySupplierQuote()]);

  const { data, isLoading } = usePurchaseRequests({
    page,
    limit: pageSize,
    search: search || undefined,
    status: status || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    minTotal: minTotal || undefined,
    maxTotal: maxTotal || undefined,
  });
  const createReq = useCreatePurchaseRequest();
  const approveReq = useApprovePurchaseRequest();
  const convertReq = useConvertRequestToOrder();
  const { data: productsData } = useProducts({ page: 1, limit: 200 });
  const products = productsData?.data ?? [];
  const requests = data?.data ?? [];

  const today = new Date().toISOString().split('T')[0];
  const { register, handleSubmit, control, reset, setValue, formState: { errors } } = useForm<RequestForm>({
    resolver: zodResolver(requestSchema),
    defaultValues: { date: today, items: [{ productId: '', quantity: '1', unitPrice: '' }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchItems = useWatch({ control, name: 'items' }) ?? [];
  const watchDate = useWatch({ control, name: 'date' });

  const comparisonResults = useMemo(() => compareTarget ? compareSupplierQuotes(compareTarget, supplierQuotes) : [], [compareTarget, supplierQuotes]);
  const kpis = useMemo(() => ({
    total: data?.meta.total ?? 0,
    pending: requests.filter((request) => request.status === 'PENDING_APPROVAL' || request.status === 'DRAFT').length,
    approved: requests.filter((request) => request.status === 'APPROVED').length,
    ordered: requests.filter((request) => request.status === 'ORDERED').length,
    amount: requests.reduce((sum, request) => sum + requestTotal(request), 0),
  }), [data?.meta.total, requests]);

  const activeFilters = [
    status && `Durum: ${STATUS_MAP[status].label}`,
    search && `Arama: ${search}`,
    dateFrom && `Başlangıç: ${formatDate(dateFrom)}`,
    dateTo && `Bitiş: ${formatDate(dateTo)}`,
    minTotal && `Min: ${formatCurrency(Number(minTotal))}`,
    maxTotal && `Max: ${formatCurrency(Number(maxTotal))}`,
  ].filter((filter): filter is string => Boolean(filter));

  const closeCreate = () => {
    setCreateOpen(false);
    reset({ date: today, items: [{ productId: '', quantity: '1', unitPrice: '' }] });
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setDateFrom('');
    setDateTo('');
    setMinTotal('');
    setMaxTotal('');
    setPage(1);
  };

  const onSubmit = (formData: RequestForm) => {
    createReq.mutate({
      date: formData.date,
      notes: formData.notes || undefined,
      items: formData.items.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
        unitPrice: item.unitPrice ? Number(item.unitPrice) : undefined,
      })),
    }, { onSuccess: closeCreate });
  };

  const exportCsv = () => {
    const header = ['No', 'Tarih', 'Durum', 'Kalem', 'Tahmini Tutar'];
    const rows = requests.map((request) => [request.number, formatDate(request.date), STATUS_MAP[request.status].label, String(request.items?.length ?? 0), String(requestTotal(request))]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'purchase-requests.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const getRowActions = (request: PurchaseRequest): RowAction[] => [
    { label: 'Detay görüntüle', icon: <Eye className="h-4 w-4" />, onClick: () => setDetailTarget(request) },
    ...(request.purchaseOrder ? [{ label: 'Siparişi aç', icon: <ShoppingCart className="h-4 w-4" />, onClick: () => router.push(`/dashboard/purchase-orders/${request.purchaseOrder!.id}`) }] : []),
    ...((request.status === 'DRAFT' || request.status === 'PENDING_APPROVAL') ? [{ label: 'Onayla', icon: <CheckCircle className="h-4 w-4" />, onClick: () => setApproveTarget(request), separator: true }] : []),
    ...(request.status === 'APPROVED' ? [
      { label: 'Teklif karşılaştır', icon: <TrendingDown className="h-4 w-4" />, onClick: () => setCompareTarget(request), separator: true },
      { label: 'Siparişe dönüştür', icon: <ArrowRight className="h-4 w-4" />, onClick: () => { setConvertContactId(''); setConvertTarget(request); } },
    ] : []),
  ];

  const columns: ColumnDef<PurchaseRequest>[] = [
    { key: 'number', header: 'Talep', width: '150px', exportValue: (request) => request.number, render: (request) => <div><button type="button" className="font-mono text-sky-400 hover:underline" onClick={(event) => { event.stopPropagation(); setDetailTarget(request); }}>{request.number}</button><p className="mt-1 text-xs text-slate-500">{formatDate(request.date)}</p></div> },
    { key: 'items', header: 'Kalemler', exportValue: (request) => request.items?.length ?? 0, render: (request) => <div><p className="text-sm text-slate-200">{request.items?.[0]?.product?.name ?? 'Ürün yok'}</p><p className="text-xs text-slate-500">{request.items?.length ?? 0} kalem · {requestFlags(request).length ? requestFlags(request).join(', ') : 'Kontrol temiz'}</p></div> },
    { key: 'totalEstimated', header: 'Tahmini Tutar', width: '145px', align: 'right', exportValue: (request) => requestTotal(request), render: (request) => <span className="font-medium text-slate-100 tabular-nums">{requestTotal(request) > 0 ? formatCurrency(requestTotal(request)) : 'Yok'}</span> },
    { key: 'status', header: 'Durum', width: '140px', exportValue: (request) => STATUS_MAP[request.status].label, render: (request) => <Badge variant={STATUS_MAP[request.status].variant} dot>{STATUS_MAP[request.status].label}</Badge> },
    { key: 'flow', header: 'Akış', width: '170px', render: (request) => <div className="flex items-center gap-1"><Badge variant={flowStepStatus(request, 'request')}>Talep</Badge><ArrowRight className="h-3 w-3 text-slate-600" /><Badge variant={flowStepStatus(request, 'order')}>Sipariş</Badge></div> },
    { key: 'actions', header: '', width: '72px', align: 'right', hideable: false, render: (request) => <RowActions actions={getRowActions(request)} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Satın Alma Talepleri"
        subtitle="Talep, onay, teklif karşılaştırma ve siparişe dönüşüm akışını yönetin."
        action={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Yeni talep</Button>}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Toplam" value={String(kpis.total)} detail="Filtre sonucu toplam" icon={ClipboardList} />
        <KpiCard label="Onay bekleyen" value={String(kpis.pending)} detail="Taslak ve onay bekleyen" icon={ClipboardCheck} tone="warning" />
        <KpiCard label="Onaylı" value={String(kpis.approved)} detail="Siparişe hazır" icon={CheckCircle} tone="success" />
        <KpiCard label="Siparişe dönen" value={String(kpis.ordered)} detail="Süreç kapanmış" icon={ShoppingCart} />
        <KpiCard label="Tahmini toplam" value={formatCurrency(kpis.amount)} detail="Bu sayfadaki kayıtlar" icon={Package} />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_180px_150px_150px_140px_140px]">
          <Input placeholder="Talep no, ürün, not ara..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} prefixIcon={<Search className="h-4 w-4" />} />
          <Select label="" options={STATUS_OPTIONS} value={status} onChange={(event) => { setStatus(parseStatus(event.target.value)); setPage(1); }} />
          <Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} />
          <Input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} />
          <Input type="number" placeholder="Min tutar" value={minTotal} onChange={(event) => { setMinTotal(event.target.value); setPage(1); }} />
          <Input type="number" placeholder="Max tutar" value={maxTotal} onChange={(event) => { setMaxTotal(event.target.value); setPage(1); }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {QUICK_STATUSES.map((item) => (
              <button key={item.value || 'all'} type="button" onClick={() => { setStatus(item.value); setPage(1); }} className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors', status === item.value ? 'border-sky-500/40 bg-sky-500/15 text-sky-200' : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200')}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Sayfa boyutu" options={[20, 50, 100].map((value) => ({ value: String(value), label: `${value} / sayfa` }))} value={String(pageSize)} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="w-32" />
            <Button variant={tableDensity === 'compact' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTableDensity('compact')}>Sıkı</Button>
            <Button variant={tableDensity === 'comfortable' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTableDensity('comfortable')}>Rahat</Button>
            <Button variant="outline" size="sm" leftIcon={<FileDown className="h-3.5 w-3.5" />} disabled={requests.length === 0} onClick={exportCsv}>Dışa aktar</Button>
          </div>
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
        data={requests}
        keyExtractor={(request) => request.id}
        isLoading={isLoading}
        onRowClick={(request) => setDetailTarget(request)}
        emptyTitle="Satın alma talebi bulunamadı"
        emptyDescription="Filtreleri temizleyin, yeni talep oluşturun veya düşük stok ekranından talep üretin."
        pagination={data ? { page, pageSize, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
        density={tableDensity}
      />

      <DetailModal request={detailTarget} onClose={() => setDetailTarget(null)} onApprove={setApproveTarget} onCompare={setCompareTarget} onConvert={(request) => { setConvertContactId(''); setConvertTarget(request); }} />

      <Modal isOpen={!!approveTarget} onClose={() => setApproveTarget(null)} title="Talebi onayla" description={approveTarget ? `${approveTarget.number} siparişe dönüşmeye hazır hale gelecek.` : undefined} footer={<><Button variant="ghost" size="sm" onClick={() => setApproveTarget(null)}>Vazgeç</Button><Button size="sm" loading={approveReq.isPending} onClick={() => { if (approveTarget) approveReq.mutate(approveTarget.id, { onSuccess: () => setApproveTarget(null) }); }}>Onayla</Button></>}>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">Onay sonrası talep, tedarikçi seçilerek satın alma siparişine dönüştürülebilir.</div>
      </Modal>

      <Modal isOpen={createOpen} onClose={closeCreate} title="Yeni satın alma talebi" description="Satın alınacak ürünleri ve tahmini miktarları belirleyin." size="xl" footer={<><Button variant="ghost" size="sm" leftIcon={<X className="h-3.5 w-3.5" />} onClick={closeCreate}>İptal</Button><Button size="sm" loading={createReq.isPending} leftIcon={<Save className="h-3.5 w-3.5" />} onClick={handleSubmit(onSubmit)}>Talebi oluştur</Button></>}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <form className="space-y-5">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <DatePicker label="Talep tarihi" required value={watchDate} onValueChange={(value) => setValue('date', value ?? '', { shouldDirty: true, shouldValidate: true })} error={errors.date?.message} clearable={false} />
                <Input label="Notlar / Açıklama" placeholder="Neden bu ürünlere ihtiyaç var?" {...register('notes')} />
              </div>
            </div>
            <div className="space-y-3">
              {fields.map((field, index) => {
                const selectedProduct = products.find((product) => product.id === watchItems?.[index]?.productId);
                const quantity = Number(watchItems?.[index]?.quantity || 0);
                const price = Number(watchItems?.[index]?.unitPrice || selectedProduct?.purchasePrice || 0);
                const lineTotal = quantity * price;
                return (
                  <div key={field.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_110px_130px_110px_40px]">
                      <ProductSelect label="Ürün" value={watchItems?.[index]?.productId ?? ''} onChange={(value) => setValue(`items.${index}.productId`, value, { shouldDirty: true, shouldValidate: true })} error={errors.items?.[index]?.productId?.message} required />
                      <Input label="Miktar" type="number" min="1" {...register(`items.${index}.quantity`)} error={errors.items?.[index]?.quantity?.message} />
                      <Input label="Tahmini fiyat" type="number" min="0" placeholder={selectedProduct ? String(selectedProduct.purchasePrice) : '0'} {...register(`items.${index}.unitPrice`)} />
                      <div><p className="text-[13px] font-medium text-slate-300">Tutar</p><p className="mt-3 text-right text-sm font-semibold text-slate-100">{formatCurrency(lineTotal)}</p></div>
                      <Button variant="ghost" size="sm" className="mt-6" disabled={fields.length === 1} leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => remove(index)} />
                    </div>
                    {selectedProduct && <p className="mt-2 text-xs text-slate-500">Varsayılan alış fiyatı: {formatCurrency(selectedProduct.purchasePrice)} · Min. stok: {selectedProduct.minStockLevel}</p>}
                  </div>
                );
              })}
              <Button variant="outline" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => append({ productId: '', quantity: '1', unitPrice: '' })}>Yeni kalem ekle</Button>
            </div>
          </form>
          <aside className="rounded-xl border border-slate-800 bg-slate-900 p-4 lg:sticky lg:top-24 lg:self-start">
            <h3 className="text-sm font-semibold text-slate-200">Talep özeti</h3>
            <p className="mt-3 text-sm text-slate-400">{fields.filter((_, index) => watchItems?.[index]?.productId).length}/{fields.length} ürün seçildi</p>
            <p className="mt-2 text-xl font-semibold text-violet-300">{formatCurrency(fields.reduce((sum, _, index) => {
              const product = products.find((item) => item.id === watchItems?.[index]?.productId);
              return sum + Number(watchItems?.[index]?.quantity || 0) * Number(watchItems?.[index]?.unitPrice || product?.purchasePrice || 0);
            }, 0))}</p>
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><span>Talep</span><ArrowRight className="h-3 w-3" /><span>Onay</span><ArrowRight className="h-3 w-3" /><span>Sipariş</span></div>
          </aside>
        </div>
      </Modal>

      <Modal isOpen={!!convertTarget} onClose={() => setConvertTarget(null)} title="Siparişe dönüştür" description={convertTarget ? `${convertTarget.number} talebini satın alma siparişine dönüştürün.` : undefined} size="md" footer={<><Button variant="ghost" size="sm" onClick={() => setConvertTarget(null)}>İptal</Button><Button size="sm" loading={convertReq.isPending} disabled={!convertContactId} onClick={() => { if (convertTarget && convertContactId) convertReq.mutate({ id: convertTarget.id, contactId: convertContactId }, { onSuccess: () => setConvertTarget(null) }); }}>Dönüştür</Button></>}>
        {convertTarget && <div className="space-y-4"><ContactSelect label="Tedarikçi" required type={['SUPPLIER', 'BOTH']} value={convertContactId} onChange={setConvertContactId} /><div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">{convertTarget.items?.length ?? 0} kalem · {formatCurrency(requestTotal(convertTarget))} tahmini tutar siparişe aktarılacak.</div></div>}
      </Modal>

      <Modal isOpen={!!compareTarget} onClose={() => { setCompareTarget(null); setSupplierQuotes([createEmptySupplierQuote(), createEmptySupplierQuote()]); }} title="Tedarikçi teklif karşılaştırma" description={compareTarget ? `${compareTarget.number} için tedarikçi fiyat, termin ve kalite skorlarını kıyaslayın.` : undefined} size="xl">
        <div className="space-y-5">
          <div className="flex justify-end">{supplierQuotes.length < 3 && <Button variant="outline" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setSupplierQuotes((current) => [...current, createEmptySupplierQuote()])}>Tedarikçi ekle</Button>}</div>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="bg-slate-950/50 text-xs text-slate-400"><tr><th className="p-4 text-left">Ürün</th>{supplierQuotes.map((quote, index) => <th key={index} className="border-l border-slate-800 p-4 text-left"><div className="space-y-2"><div className="flex items-center justify-between"><span>Tedarikçi #{index + 1}</span>{supplierQuotes.length > 2 && <button type="button" onClick={() => setSupplierQuotes((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X className="h-3.5 w-3.5" /></button>}</div><ContactSelect label="" required type={['SUPPLIER', 'BOTH']} value={quote.contactId} onChange={(value) => setSupplierQuotes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, contactId: value } : item))} /><div className="grid grid-cols-2 gap-2"><Input type="number" placeholder="Termin" value={quote.leadTimeDays} onChange={(event) => setSupplierQuotes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, leadTimeDays: event.target.value } : item))} /><Input type="number" placeholder="Kalite" value={quote.qualityScore} onChange={(event) => setSupplierQuotes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, qualityScore: event.target.value } : item))} /></div></div></th>)}</tr></thead>
              <tbody className="divide-y divide-slate-800">
                {compareTarget?.items?.map((item) => <tr key={item.id}><td className="p-4"><p className="font-medium text-slate-100">{products.find((product) => product.id === item.productId)?.name ?? item.description ?? 'Ürün'}</p><p className="text-xs text-slate-500">Miktar: {item.quantity}</p></td>{supplierQuotes.map((quote, index) => <td key={index} className="border-l border-slate-800 p-4"><Input type="number" placeholder="Birim teklif" value={quote.prices[item.productId] ?? ''} onChange={(event) => setSupplierQuotes((current) => current.map((currentQuote, quoteIndex) => quoteIndex === index ? { ...currentQuote, prices: { ...currentQuote.prices, [item.productId]: event.target.value } } : currentQuote))} /><p className="mt-2 text-right text-xs text-slate-500">{formatCurrency(Number(item.quantity) * Number(quote.prices[item.productId] || 0))}</p></td>)}</tr>)}
                <tr className="bg-slate-950/35">{supplierQuotes.map((quote, index) => {
                  const result = comparisonResults[index];
                  const recommended = result?.isRecommended;
                  return index === 0 ? (
                    <>
                      <td className="p-4 font-semibold text-slate-300">Toplam / skor</td>
                      <td className={cn('border-l border-slate-800 p-4', recommended && 'bg-emerald-500/5')}><QuoteResultCell result={result} onChoose={() => compareTarget && result?.isComplete && setOrderConfirm({ request: compareTarget, quote, result })} /></td>
                    </>
                  ) : <td key={index} className={cn('border-l border-slate-800 p-4', recommended && 'bg-emerald-500/5')}><QuoteResultCell result={result} onChoose={() => compareTarget && result?.isComplete && setOrderConfirm({ request: compareTarget, quote, result })} /></td>;
                })}</tr>
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!orderConfirm} onClose={() => setOrderConfirm(null)} title="Tekliften sipariş oluştur" description={orderConfirm ? `${formatCurrency(orderConfirm.result.total)} toplam teklif siparişe dönüşecek.` : undefined} footer={<><Button variant="ghost" size="sm" onClick={() => setOrderConfirm(null)}>Vazgeç</Button><Button size="sm" loading={convertReq.isPending} onClick={() => { if (!orderConfirm) return; convertReq.mutate({ id: orderConfirm.request.id, contactId: orderConfirm.quote.contactId, items: orderConfirm.request.items?.map((item) => ({ productId: item.productId, unitPrice: Number(orderConfirm.quote.prices[item.productId] || 0) })) }, { onSuccess: () => { setOrderConfirm(null); setCompareTarget(null); setSupplierQuotes([createEmptySupplierQuote(), createEmptySupplierQuote()]); } }); }}>Sipariş oluştur</Button></>}>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">Seçilen tedarikçi ve teklif fiyatlarıyla satın alma siparişi oluşturulacak. Devam etmeden önce toplam ve termin bilgisini kontrol edin.</div>
      </Modal>
    </div>
  );
}

function QuoteResultCell({ result, onChoose }: { result: QuoteComparisonResult | undefined; onChoose: () => void }) {
  return (
    <div className="space-y-2 text-right">
      <p className={cn('font-semibold tabular-nums', result?.isRecommended ? 'text-emerald-300' : 'text-slate-100')}>{formatCurrency(result?.total ?? 0)}</p>
      <p className="text-xs text-slate-500">Termin: {result?.leadTimeDays ?? '-'} gün · Kalite: {result?.qualityScore ?? '-'}/100</p>
      <p className="text-xs text-slate-500">Skor: {result?.isComplete ? result.weightedScore : '-'}</p>
      {result?.isRecommended && <Badge variant="success">Önerilen</Badge>}
      <Button className="w-full" size="sm" disabled={!result?.isComplete} onClick={onChoose}>Sipariş oluştur</Button>
    </div>
  );
}
