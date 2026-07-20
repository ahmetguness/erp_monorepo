'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ClipboardCopy, CreditCard, ExternalLink, Eye, FileCheck, FilterX, Plus, RefreshCw, Search, Send, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { RowActions, type RowAction } from '@/components/shared/RowActions';
import { DeliveryNoteSelect, InvoiceSelect } from '@/components/shared/EntitySelect';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useEDocuments, useCreateEDocument, useEDocumentSummary, useUpdateEDocumentStatus } from '@/hooks/useEDocuments';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import type { EDocument, EDocumentStatus, EDocumentType } from '@/services/e-document.service';

const TYPE_MAP: Record<EDocumentType, { label: string; variant: BadgeVariant }> = {
  E_INVOICE: { label: 'E-Fatura', variant: 'info' },
  E_ARCHIVE: { label: 'E-Arşiv', variant: 'purple' },
  E_WAYBILL: { label: 'E-İrsaliye', variant: 'success' },
};

const STATUS_MAP: Record<EDocumentStatus, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: 'Bekliyor', variant: 'warning' },
  PROCESSING: { label: 'İşleniyor', variant: 'info' },
  SENT: { label: 'Gönderildi', variant: 'info' },
  ACCEPTED: { label: 'Kabul edildi', variant: 'success' },
  REJECTED: { label: 'Reddedildi', variant: 'danger' },
  CANCELLED: { label: 'İptal', variant: 'neutral' },
  ERROR: { label: 'Hata', variant: 'danger' },
};

const TYPE_OPTIONS: Array<{ value: EDocumentType | ''; label: string }> = [
  { value: '', label: 'Tüm Tipler' },
  { value: 'E_INVOICE', label: TYPE_MAP.E_INVOICE.label },
  { value: 'E_ARCHIVE', label: TYPE_MAP.E_ARCHIVE.label },
  { value: 'E_WAYBILL', label: TYPE_MAP.E_WAYBILL.label },
];

const STATUS_OPTIONS: Array<{ value: EDocumentStatus | ''; label: string }> = [
  { value: '', label: 'Tüm Durumlar' },
  ...Object.entries(STATUS_MAP).map(([value, meta]) => ({ value: value as EDocumentStatus, label: meta.label })),
];

const QUICK_STATUSES: Array<{ value: EDocumentStatus | ''; label: string }> = [
  { value: '', label: 'Tümü' },
  { value: 'PENDING', label: 'Bekleyen' },
  { value: 'PROCESSING', label: 'İşleniyor' },
  { value: 'ACCEPTED', label: 'Kabul' },
  { value: 'ERROR', label: 'Hata' },
  { value: 'REJECTED', label: 'Ret' },
];

function parseType(value: string): EDocumentType | '' {
  return value === 'E_INVOICE' || value === 'E_ARCHIVE' || value === 'E_WAYBILL' ? value : '';
}

function parseStatus(value: string): EDocumentStatus | '' {
  return value in STATUS_MAP ? value as EDocumentStatus : '';
}

function sourceLabel(document: EDocument): string {
  if (document.invoice) return `Fatura ${document.invoice.number}`;
  if (document.deliveryNote) return `İrsaliye ${document.deliveryNote.number}`;
  return 'Kaynak yok';
}

function sourceHref(document: EDocument): string | null {
  if (document.invoice) return `/dashboard/invoices/${document.invoice.id}`;
  if (document.deliveryNote) return `/dashboard/delivery-notes?deliveryNoteId=${document.deliveryNote.id}`;
  return null;
}

function statusTime(document: EDocument): string {
  return document.acceptedAt ?? document.rejectedAt ?? document.cancelledAt ?? document.sentAt ?? document.lastRetryAt ?? document.createdAt;
}

function timeline(document: EDocument): Array<{ label: string; value: string | null; done: boolean; variant: BadgeVariant }> {
  return [
    { label: 'Oluşturuldu', value: document.createdAt, done: true, variant: 'info' },
    { label: 'Gönderildi', value: document.sentAt, done: Boolean(document.sentAt), variant: 'info' },
    { label: 'Kabul', value: document.acceptedAt, done: Boolean(document.acceptedAt), variant: 'success' },
    { label: 'Ret', value: document.rejectedAt, done: Boolean(document.rejectedAt), variant: 'danger' },
    { label: 'İptal', value: document.cancelledAt, done: Boolean(document.cancelledAt), variant: 'neutral' },
  ];
}

function KpiCard({ label, value, detail, icon: Icon, tone = 'neutral' }: { label: string; value: string; detail: string; icon: typeof FileCheck; tone?: BadgeVariant }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">{value}</p>
        </div>
        <div className={cn('rounded-lg border p-2', tone === 'danger' ? 'border-red-500/20 bg-red-500/10 text-red-300' : tone === 'success' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : tone === 'warning' ? 'border-amber-500/20 bg-amber-500/10 text-amber-300' : 'border-sky-500/20 bg-sky-500/10 text-sky-300')}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function DetailModal({ document, onClose, onRetry }: { document: EDocument | null; onClose: () => void; onRetry: (document: EDocument) => void }) {
  if (!document) return null;
  const type = TYPE_MAP[document.type];
  const status = STATUS_MAP[document.status];
  const href = sourceHref(document);

  return (
    <Modal isOpen={!!document} onClose={onClose} title={`${type.label} detayı`} size="xl" footer={<Button variant="ghost" size="sm" onClick={onClose}>Kapat</Button>}>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"><p className="text-[10px] text-slate-500">Tip</p><Badge variant={type.variant}>{type.label}</Badge></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"><p className="text-[10px] text-slate-500">Durum</p><Badge variant={status.variant}>{status.label}</Badge></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"><p className="text-[10px] text-slate-500">Deneme</p><p className="text-sm text-slate-200">{document.retryCount}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"><p className="text-[10px] text-slate-500">Son işlem</p><p className="text-sm text-slate-200">{formatDateTime(statusTime(document))}</p></div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="text-sm font-semibold text-slate-200">Kaynak belge</h3>
            <div className="mt-3 space-y-2 text-sm">
              <p className="text-slate-300">{sourceLabel(document)}</p>
              {href && <Link href={href} className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200">Kaynağı aç <ExternalLink className="h-3 w-3" /></Link>}
              <p className="font-mono text-xs text-slate-500">ID: {document.id}</p>
              <p className="font-mono text-xs text-slate-500">UUID: {document.uuid ?? 'Yok'}</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="text-sm font-semibold text-slate-200">Sağlayıcı cevabı</h3>
            <p className="mt-3 text-sm text-slate-300">{document.providerMessage ?? 'Sağlayıcı mesajı yok.'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" leftIcon={<ClipboardCopy className="h-3.5 w-3.5" />} onClick={() => navigator.clipboard.writeText(document.providerMessage ?? document.uuid ?? document.id)}>Kopyala</Button>
              {(document.status === 'ERROR' || document.status === 'REJECTED') && <Button size="sm" leftIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => onRetry(document)}>Tekrar dene</Button>}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-sm font-semibold text-slate-200">Zaman çizelgesi</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            {timeline(document).map((item) => (
              <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
                <Badge variant={item.done ? item.variant : 'neutral'}>{item.label}</Badge>
                <p className="mt-2 text-xs text-slate-500">{item.value ? formatDateTime(item.value) : 'Bekliyor'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function EDocumentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isStarter } = usePlanFeatures();
  const initialDeliveryNoteId = searchParams.get('deliveryNoteId') ?? '';
  const initialInvoiceId = searchParams.get('invoiceId') ?? '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<EDocumentType | ''>(initialDeliveryNoteId ? 'E_WAYBILL' : '');
  const [statusFilter, setStatusFilter] = useState<EDocumentStatus | ''>('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'invoice' | 'delivery-note'>(initialDeliveryNoteId ? 'delivery-note' : initialInvoiceId ? 'invoice' : 'all');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [tableDensity, setTableDensity] = useState<'comfortable' | 'compact'>('compact');
  const [createOpen, setCreateOpen] = useState(Boolean(initialDeliveryNoteId || initialInvoiceId));
  const [detailDocument, setDetailDocument] = useState<EDocument | null>(null);
  const [retryDocument, setRetryDocument] = useState<EDocument | null>(null);
  const [form, setForm] = useState<{ type: EDocumentType; invoiceId: string; deliveryNoteId: string }>({
    type: initialDeliveryNoteId ? 'E_WAYBILL' : 'E_INVOICE',
    invoiceId: initialInvoiceId,
    deliveryNoteId: initialDeliveryNoteId,
  });

  const { data, isLoading } = useEDocuments({
    page,
    limit: 20,
    search: search || undefined,
    type: typeFilter || undefined,
    status: statusFilter || undefined,
    invoiceId: initialInvoiceId || undefined,
    deliveryNoteId: initialDeliveryNoteId || undefined,
    source: sourceFilter === 'all' ? undefined : sourceFilter,
    onlyErrors: onlyErrors ? 'true' : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const { data: summary } = useEDocumentSummary();
  const createDoc = useCreateEDocument();
  const updateStatus = useUpdateEDocumentStatus();
  const documents = data?.data ?? [];
  const filteredTypeOptions = TYPE_OPTIONS.filter((option) => option.value && (!isStarter || option.value !== 'E_WAYBILL')) as Array<{ value: EDocumentType; label: string }>;
  const canCreate = form.type === 'E_WAYBILL' ? Boolean(form.deliveryNoteId) : Boolean(form.invoiceId);
  const activeFilters = [
    typeFilter && `Tip: ${TYPE_MAP[typeFilter].label}`,
    statusFilter && `Durum: ${STATUS_MAP[statusFilter].label}`,
    sourceFilter !== 'all' && `Kaynak: ${sourceFilter === 'invoice' ? 'Fatura' : 'İrsaliye'}`,
    onlyErrors && 'Sadece hatalılar',
    search && `Arama: ${search}`,
    dateFrom && `Başlangıç: ${formatDate(dateFrom)}`,
    dateTo && `Bitiş: ${formatDate(dateTo)}`,
    initialDeliveryNoteId && 'İrsaliye bağlantısı',
    initialInvoiceId && 'Fatura bağlantısı',
  ].filter((filter): filter is string => Boolean(filter));

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('');
    setStatusFilter('');
    setSourceFilter('all');
    setOnlyErrors(false);
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const submitCreate = () => {
    if (!canCreate) return;
    createDoc.mutate({
      type: form.type,
      invoiceId: form.type !== 'E_WAYBILL' ? form.invoiceId : undefined,
      deliveryNoteId: form.type === 'E_WAYBILL' ? form.deliveryNoteId : undefined,
    }, { onSuccess: () => setCreateOpen(false) });
  };

  const retry = () => {
    if (!retryDocument) return;
    updateStatus.mutate({ id: retryDocument.id, status: 'PENDING', providerMessage: 'Yeniden gönderim kuyruğuna alındı.' }, { onSuccess: () => setRetryDocument(null) });
  };

  const getRowActions = (document: EDocument): RowAction[] => [
    { label: 'Görüntüle', icon: <Eye className="h-4 w-4" />, onClick: () => setDetailDocument(document) },
    ...(sourceHref(document) ? [{ label: 'Kaynak belgeyi aç', icon: <ExternalLink className="h-4 w-4" />, onClick: () => router.push(sourceHref(document) ?? '/dashboard/e-documents') }] : []),
    { label: 'Sağlayıcı cevabını kopyala', icon: <ClipboardCopy className="h-4 w-4" />, onClick: () => navigator.clipboard.writeText(document.providerMessage ?? document.uuid ?? document.id) },
    ...((document.status === 'ERROR' || document.status === 'REJECTED') ? [{ label: 'Tekrar dene', icon: <RefreshCw className="h-4 w-4" />, onClick: () => setRetryDocument(document), separator: true }] : []),
    ...(document.status !== 'CANCELLED' && document.status !== 'ACCEPTED' ? [{ label: 'İptal et', icon: <XCircle className="h-4 w-4" />, variant: 'danger' as const, onClick: () => updateStatus.mutate({ id: document.id, status: 'CANCELLED', providerMessage: 'Kullanıcı tarafından iptal edildi.' }), separator: true }] : []),
  ];

  const columns: ColumnDef<EDocument>[] = [
    {
      key: 'source',
      header: 'Belge',
      render: (document) => (
        <div>
          <button type="button" className="text-left text-sm font-medium text-sky-300 hover:text-sky-200" onClick={(event) => { event.stopPropagation(); setDetailDocument(document); }}>{sourceLabel(document)}</button>
          <p className="mt-1 font-mono text-xs text-slate-500">{document.uuid ?? document.id}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Tip', width: '120px', render: (document) => <Badge variant={TYPE_MAP[document.type].variant}>{TYPE_MAP[document.type].label}</Badge> },
    { key: 'status', header: 'Durum', width: '135px', render: (document) => <Badge variant={STATUS_MAP[document.status].variant} dot>{STATUS_MAP[document.status].label}</Badge> },
    {
      key: 'provider',
      header: 'Sağlayıcı',
      render: (document) => (
        <div>
          <p className="text-sm text-slate-300">{document.providerCode ?? 'Kod yok'}</p>
          <p className="line-clamp-1 text-xs text-slate-500">{document.providerMessage ?? 'Mesaj yok'}</p>
        </div>
      ),
    },
    { key: 'retryCount', header: 'Deneme', width: '80px', align: 'center', render: (document) => <span className={document.retryCount > 0 ? 'font-medium text-amber-300' : 'text-slate-400'}>{document.retryCount}</span> },
    { key: 'createdAt', header: 'Son işlem', width: '145px', render: (document) => <span className="text-xs text-slate-400">{formatDateTime(statusTime(document))}</span> },
    { key: 'actions', header: '', width: '72px', align: 'right', render: (document) => <RowActions actions={getRowActions(document)} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="E-Belgeler"
        subtitle="E-Fatura, E-Arşiv ve E-İrsaliye gönderimlerini izleyin."
        action={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Yeni e-belge</Button>}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Toplam" value={String(summary?.total ?? 0)} detail="Tüm e-belge kayıtları" icon={FileCheck} />
        <KpiCard label="Bekleyen" value={String(summary?.pending ?? 0)} detail="Kuyrukta veya işleniyor" icon={Send} tone="warning" />
        <KpiCard label="Kabul" value={String(summary?.accepted ?? 0)} detail="Başarıyla tamamlandı" icon={CheckCircle2} tone="success" />
        <KpiCard label="Hata / Ret" value={String(summary?.sendingErrors ?? 0)} detail="Müdahale bekleyen kayıtlar" icon={AlertTriangle} tone="danger" />
        <KpiCard label="Kontör" value={summary?.creditBalance === null || summary?.creditBalance === undefined ? 'Yok' : String(summary.creditBalance)} detail={summary?.creditStatus === 'configured' ? 'Tanımlı bakiye' : 'Tanımlı değil'} icon={CreditCard} tone={summary?.creditStatus === 'configured' ? 'info' : 'warning'} />
      </div>

      {summary && (summary.sendingErrors > 0 || summary.creditStatus === 'not_configured') && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <p className="text-sm font-semibold text-amber-100">E-belge kontrolü gerekiyor</p>
              <p className="mt-1 text-sm text-amber-100/80">
                {summary.sendingErrors > 0 ? `${summary.sendingErrors} hata/reddedilen belge var. ` : ''}
                {summary.latestError?.providerMessage ? `Son mesaj: ${summary.latestError.providerMessage}. ` : ''}
                {summary.creditStatus === 'not_configured' ? 'Kontör bilgisi tanımlı değil.' : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {isStarter && (
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-4 text-sm text-sky-100">
          Starter planda e-fatura ve e-arşiv kullanılabilir. E-irsaliye için plan yükseltme gerekir.
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_160px_170px_150px_150px_150px]">
          <Input placeholder="UUID, fatura, irsaliye, sağlayıcı mesajı ara..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} prefixIcon={<Search className="h-4 w-4" />} />
          <Select label="" options={TYPE_OPTIONS.filter((option) => !isStarter || option.value !== 'E_WAYBILL')} value={typeFilter} onChange={(event) => { setTypeFilter(parseType(event.target.value)); setPage(1); }} />
          <Select label="" options={STATUS_OPTIONS} value={statusFilter} onChange={(event) => { setStatusFilter(parseStatus(event.target.value)); setPage(1); }} />
          <Select label="" options={[{ value: 'all', label: 'Tüm Kaynaklar' }, { value: 'invoice', label: 'Fatura' }, { value: 'delivery-note', label: 'İrsaliye' }]} value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value === 'invoice' || event.target.value === 'delivery-note' ? event.target.value : 'all'); setPage(1); }} />
          <Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} />
          <Input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {QUICK_STATUSES.map((item) => (
              <button key={item.value || 'all'} type="button" onClick={() => { setStatusFilter(item.value); setOnlyErrors(false); setPage(1); }} className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors', statusFilter === item.value && !onlyErrors ? 'border-sky-500/40 bg-sky-500/15 text-sky-200' : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200')}>
                {item.label}
              </button>
            ))}
            <button type="button" onClick={() => { setOnlyErrors((current) => !current); setStatusFilter(''); setPage(1); }} className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors', onlyErrors ? 'border-red-500/40 bg-red-500/15 text-red-200' : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200')}>
              Sadece hatalılar
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={tableDensity === 'compact' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTableDensity('compact')}>Sıkı</Button>
            <Button variant={tableDensity === 'comfortable' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTableDensity('comfortable')}>Rahat</Button>
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
        data={documents}
        keyExtractor={(document) => document.id}
        isLoading={isLoading}
        onRowClick={(document) => setDetailDocument(document)}
        emptyTitle="E-belge bulunamadı"
        emptyDescription="Filtreleri temizleyin veya yeni bir e-belge oluşturarak başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
        density={tableDensity}
      />

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni e-belge"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
            <Button size="sm" loading={createDoc.isPending} disabled={!canCreate} onClick={submitCreate}>Oluştur</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Belge tipi"
            required
            options={filteredTypeOptions}
            value={form.type}
            onChange={(event) => {
              const nextType = filteredTypeOptions.find((option) => option.value === event.target.value)?.value ?? 'E_INVOICE';
              setForm((current) => ({ ...current, type: nextType, invoiceId: '', deliveryNoteId: '' }));
            }}
          />
          {(form.type === 'E_INVOICE' || form.type === 'E_ARCHIVE') && (
            <InvoiceSelect label="Fatura" value={form.invoiceId} onChange={(value) => setForm((current) => ({ ...current, invoiceId: value }))} required />
          )}
          {form.type === 'E_WAYBILL' && (
            <DeliveryNoteSelect label="İrsaliye" value={form.deliveryNoteId} onChange={(value) => setForm((current) => ({ ...current, deliveryNoteId: value }))} required />
          )}
          <p className="text-xs text-slate-500">Zorunlu kaynak belge seçilmeden e-belge oluşturulamaz.</p>
        </div>
      </Modal>

      <DetailModal document={detailDocument} onClose={() => setDetailDocument(null)} onRetry={(document) => setRetryDocument(document)} />

      <Modal
        isOpen={!!retryDocument}
        onClose={() => setRetryDocument(null)}
        title="Tekrar gönder"
        description={retryDocument ? `${sourceLabel(retryDocument)} yeniden kuyruğa alınacak.` : undefined}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRetryDocument(null)}>Vazgeç</Button>
            <Button size="sm" leftIcon={<RefreshCw className="h-3.5 w-3.5" />} loading={updateStatus.isPending} onClick={retry}>Onayla</Button>
          </>
        }
      >
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          Bu işlem belgeyi yeniden gönderim kuyruğuna alır. Sağlayıcı tarafında mükerrer gönderim riski varsa önce kaynak belgeyi kontrol edin.
        </div>
      </Modal>
    </div>
  );
}
