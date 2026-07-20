'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarDays, ClipboardCheck, Download, ExternalLink, Eye, FileText, PackageCheck, Plus, Printer, Search, Send, Truck, Warehouse } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { RowActions, type RowAction } from '@/components/shared/RowActions';
import { AttachmentPanel } from '@/components/shared/AttachmentPanel';
import { EntityImageManager } from '@/components/shared/EntityImageManager';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useDeliveryNotes, useUpdateDeliveryNoteStatus } from '@/hooks/useDeliveryNotes';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import type { DeliveryNote, DeliveryNoteStatus, DeliveryNoteType } from '@/services/delivery-note.service';

const TYPE_OPTIONS: Array<{ value: DeliveryNoteType | ''; label: string }> = [
  { value: '', label: 'Tüm Tipler' },
  { value: 'OUTBOUND', label: 'Sevk' },
  { value: 'INBOUND', label: 'Giriş' },
  { value: 'RETURN', label: 'İade' },
];

const TYPE_MAP: Record<DeliveryNoteType, { label: string; variant: BadgeVariant }> = {
  OUTBOUND: { label: 'Sevk', variant: 'info' },
  INBOUND: { label: 'Giriş', variant: 'success' },
  RETURN: { label: 'İade', variant: 'warning' },
};

const STATUS_MAP: Record<DeliveryNoteStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: 'Taslak', variant: 'warning' },
  CONFIRMED: { label: 'Onaylı', variant: 'info' },
  PARTIALLY_SHIPPED: { label: 'Kısmi Sevk', variant: 'info' },
  SHIPPED: { label: 'Sevk Edildi', variant: 'success' },
  DELIVERED: { label: 'Teslim Edildi', variant: 'success' },
  CANCELLED: { label: 'İptal', variant: 'neutral' },
};

const STATUS_OPTIONS: Array<{ value: DeliveryNoteStatus | ''; label: string }> = [
  { value: '', label: 'Tüm Durumlar' },
  ...Object.entries(STATUS_MAP).map(([value, meta]) => ({ value: value as DeliveryNoteStatus, label: meta.label })),
];

const QUICK_STATUSES: Array<{ value: DeliveryNoteStatus | ''; label: string }> = [
  { value: '', label: 'Tümü' },
  { value: 'DRAFT', label: 'Taslak' },
  { value: 'CONFIRMED', label: 'Sevke hazır' },
  { value: 'SHIPPED', label: 'Yolda' },
  { value: 'DELIVERED', label: 'Teslim' },
];

function parseType(value: string): DeliveryNoteType | '' {
  return value === 'OUTBOUND' || value === 'INBOUND' || value === 'RETURN' ? value : '';
}

function parseStatus(value: string): DeliveryNoteStatus | '' {
  return value in STATUS_MAP ? value as DeliveryNoteStatus : '';
}

function nextTransition(note: DeliveryNote): { label: string; status: DeliveryNoteStatus; dateField?: 'shippedAt' | 'deliveredAt'; impact: string } | null {
  if (note.status === 'DRAFT') return { label: 'Onayla', status: 'CONFIRMED', impact: 'İrsaliye sevk sürecine alınır.' };
  if (note.status === 'CONFIRMED') return { label: 'Sevk et', status: 'SHIPPED', dateField: 'shippedAt', impact: 'Stok hareketleri ve sevk tarihi güncellenir.' };
  if (note.status === 'PARTIALLY_SHIPPED') return { label: 'Sevk et', status: 'SHIPPED', dateField: 'shippedAt', impact: 'Kalan sevk süreci ilerletilir.' };
  if (note.status === 'SHIPPED') return { label: 'Teslim al', status: 'DELIVERED', dateField: 'deliveredAt', impact: 'Teslim tarihi kaydedilir ve süreç kapanır.' };
  return null;
}

function quantityState(note: DeliveryNote): { label: string; variant: BadgeVariant; progress: number; flags: string[] } {
  const items = note.items ?? [];
  if (items.length === 0) return { label: `${note._count?.items ?? 0} kalem`, variant: 'neutral', progress: 0, flags: [] };
  const ordered = items.reduce((sum, item) => sum + item.orderedQty, 0);
  const delivered = items.reduce((sum, item) => sum + item.deliveredQty, 0);
  const flags = items.flatMap((item) => {
    const rowFlags: string[] = [];
    if (item.deliveredQty === 0) rowFlags.push('Sıfır teslim');
    if (item.deliveredQty < item.orderedQty) rowFlags.push('Eksik teslim');
    if (item.deliveredQty > item.orderedQty) rowFlags.push('Fazla teslim');
    return rowFlags;
  });
  const progress = ordered > 0 ? Math.min(100, Math.round((delivered / ordered) * 100)) : 0;
  return { label: `${delivered}/${ordered}`, variant: flags.length > 0 ? 'warning' : 'success', progress, flags: [...new Set(flags)] };
}

function EWaybillState({ note }: { note: DeliveryNote }) {
  const required = note.status === 'SHIPPED' || note.status === 'DELIVERED';
  return <Badge variant={required ? 'warning' : 'neutral'}>{required ? 'E-irsaliye kontrolü' : 'Hazır değil'}</Badge>;
}

function KpiCard({ label, value, detail, icon: Icon, tone = 'neutral' }: { label: string; value: string; detail: string; icon: typeof Truck; tone?: BadgeVariant }) {
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

function DetailModal({ note, onClose }: { note: DeliveryNote | null; onClose: () => void }) {
  if (!note) return null;
  const status = STATUS_MAP[note.status];
  const type = TYPE_MAP[note.type];
  const q = quantityState(note);

  return (
    <Modal isOpen={!!note} onClose={onClose} title={`İrsaliye ${note.number}`} size="xl" footer={<Button variant="ghost" size="sm" onClick={onClose}>Kapat</Button>}>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"><p className="text-[10px] text-slate-500">Tip</p><Badge variant={type.variant}>{type.label}</Badge></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"><p className="text-[10px] text-slate-500">Durum</p><Badge variant={status.variant}>{status.label}</Badge></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"><p className="text-[10px] text-slate-500">Tarih</p><p className="mt-1 text-sm text-slate-200">{formatDate(note.date)}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"><p className="text-[10px] text-slate-500">Kalem durumu</p><Badge variant={q.variant}>{q.label}</Badge></div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="text-sm font-semibold text-slate-200">Sevk bilgisi</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-slate-500">Depo</p><p className="text-slate-300">{note.warehouse?.name ?? 'Yok'}</p></div>
              <div><p className="text-xs text-slate-500">Taşıyıcı</p><p className="text-slate-300">{note.carrier ?? 'Yok'}</p></div>
              <div><p className="text-xs text-slate-500">Takip no</p><p className="text-slate-300">{note.trackingNumber ?? 'Yok'}</p></div>
              <div><p className="text-xs text-slate-500">E-irsaliye</p><EWaybillState note={note} /></div>
              <div><p className="text-xs text-slate-500">Sevk zamanı</p><p className="text-slate-300">{formatDateTime(note.shippedAt)}</p></div>
              <div><p className="text-xs text-slate-500">Teslim zamanı</p><p className="text-slate-300">{formatDateTime(note.deliveredAt)}</p></div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="text-sm font-semibold text-slate-200">Cari ve kaynak</h3>
            <div className="mt-3 space-y-3 text-sm">
              <div><p className="text-xs text-slate-500">Cari</p><p className="text-slate-300">{note.contact?.name ?? 'Yok'}</p></div>
              <div><p className="text-xs text-slate-500">Kaynak</p>
                {note.salesOrder ? <Link className="text-sky-300 hover:text-sky-200" href={`/dashboard/sales-orders/${note.salesOrder.id}`}>Satış siparişi {note.salesOrder.number}</Link>
                  : note.purchaseOrder ? <Link className="text-sky-300 hover:text-sky-200" href={`/dashboard/purchase-orders/${note.purchaseOrder.id}`}>Satın alma {note.purchaseOrder.number}</Link>
                    : <p className="text-slate-300">Bağlı sipariş yok</p>}
              </div>
              {note.notes && <div><p className="text-xs text-slate-500">Not</p><p className="text-slate-300">{note.notes}</p></div>}
            </div>
          </div>
        </div>

        <DataTable
          columns={[
            { key: 'product', header: 'Ürün', render: (item) => <div><p className="text-slate-200">{item.product?.name ?? item.description ?? item.productId}</p><p className="text-xs text-slate-500">{item.product?.code ?? item.description}</p></div> },
            { key: 'orderedQty', header: 'Sipariş', width: '100px', align: 'right', render: (item) => <span className="text-slate-300">{item.orderedQty}</span> },
            { key: 'deliveredQty', header: 'Teslim', width: '100px', align: 'right', render: (item) => <span className={item.deliveredQty !== item.orderedQty ? 'font-medium text-amber-300' : 'text-slate-300'}>{item.deliveredQty}</span> },
            { key: 'flags', header: 'Kontrol', width: '140px', render: (item) => {
              const flags = [];
              if (item.deliveredQty === 0) flags.push('Sıfır');
              if (item.deliveredQty < item.orderedQty) flags.push('Eksik');
              if (item.deliveredQty > item.orderedQty) flags.push('Fazla');
              return flags.length ? <div className="flex flex-wrap gap-1">{flags.map((flag) => <Badge key={flag} variant="warning">{flag}</Badge>)}</div> : <Badge variant="success">Temiz</Badge>;
            } },
          ]}
          data={note.items ?? []}
          keyExtractor={(item) => item.id}
          emptyTitle="Kalem bulunamadı"
          emptyDescription="Bu irsaliyede ürün satırı yok. Kayıt eksik olabilir."
          density="compact"
        />

        <EntityImageManager entityType="DELIVERY_NOTE" entityId={note.id} label="İrsaliye görseli" description="Teslimat evrakı, sevk belgesi veya imzalı irsaliye fotoğrafı yükleyin." />
        <AttachmentPanel entityType="DELIVERY_NOTE" entityId={note.id} />
      </div>
    </Modal>
  );
}

export function DeliveryNotesPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<DeliveryNoteType | ''>('');
  const [statusFilter, setStatusFilter] = useState<DeliveryNoteStatus | ''>('');
  const [carrier, setCarrier] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [tableDensity, setTableDensity] = useState<'comfortable' | 'compact'>('compact');
  const [detailNote, setDetailNote] = useState<DeliveryNote | null>(null);
  const [transitionNote, setTransitionNote] = useState<DeliveryNote | null>(null);
  const [transitionDate, setTransitionDate] = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading } = useDeliveryNotes({
    page,
    limit: 20,
    search: search || undefined,
    type: typeFilter || undefined,
    status: statusFilter || undefined,
    carrier: carrier || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const updateStatus = useUpdateDeliveryNoteStatus();
  const notes = data?.data ?? [];
  const selectedTransition = transitionNote ? nextTransition(transitionNote) : null;

  const kpis = useMemo(() => {
    const total = data?.meta.total ?? 0;
    const draft = notes.filter((note) => note.status === 'DRAFT').length;
    const ready = notes.filter((note) => note.status === 'CONFIRMED').length;
    const shipped = notes.filter((note) => note.status === 'SHIPPED' || note.status === 'PARTIALLY_SHIPPED').length;
    const delivered = notes.filter((note) => note.status === 'DELIVERED').length;
    return { total, draft, ready, shipped, delivered };
  }, [data?.meta.total, notes]);

  const activeFilters = [
    typeFilter && `Tip: ${TYPE_MAP[typeFilter].label}`,
    statusFilter && `Durum: ${STATUS_MAP[statusFilter].label}`,
    search && `Arama: ${search}`,
    carrier && `Taşıyıcı: ${carrier}`,
    dateFrom && `Başlangıç: ${formatDate(dateFrom)}`,
    dateTo && `Bitiş: ${formatDate(dateTo)}`,
  ].filter((item): item is string => Boolean(item));

  const clearFilters = () => {
    setTypeFilter('');
    setStatusFilter('');
    setSearch('');
    setCarrier('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const confirmTransition = () => {
    if (!transitionNote || !selectedTransition) return;
    updateStatus.mutate({
      id: transitionNote.id,
      status: selectedTransition.status,
      ...(selectedTransition.dateField === 'shippedAt' ? { shippedAt: transitionDate } : {}),
      ...(selectedTransition.dateField === 'deliveredAt' ? { deliveredAt: transitionDate } : {}),
    }, {
      onSuccess: () => {
        setTransitionNote(null);
        setDetailNote(null);
      },
    });
  };

  const getRowActions = (note: DeliveryNote): RowAction[] => {
    const transition = nextTransition(note);
    return [
      { label: 'Görüntüle', icon: <Eye className="h-4 w-4" />, onClick: () => setDetailNote(note) },
      { label: 'PDF / Yazdır', icon: <Printer className="h-4 w-4" />, onClick: () => window.print() },
      { label: 'E-irsaliye oluştur', icon: <Send className="h-4 w-4" />, onClick: () => router.push(`/dashboard/e-documents?deliveryNoteId=${note.id}`) },
      ...(note.salesOrder ? [{ label: 'Kaynak siparişi aç', icon: <ExternalLink className="h-4 w-4" />, onClick: () => router.push(`/dashboard/sales-orders/${note.salesOrder!.id}`) }] : []),
      ...(transition ? [{ label: transition.label, icon: <ArrowRight className="h-4 w-4" />, onClick: () => { setTransitionDate(new Date().toISOString().slice(0, 10)); setTransitionNote(note); }, separator: true }] : []),
    ];
  };

  const columns: ColumnDef<DeliveryNote>[] = [
    {
      key: 'number',
      header: 'İrsaliye',
      width: '170px',
      render: (note) => (
        <div>
          <button type="button" className="font-mono text-sm text-sky-400 hover:underline" onClick={(event) => { event.stopPropagation(); setDetailNote(note); }}>{note.number}</button>
          <p className="mt-1 text-xs text-slate-500">{formatDate(note.date)}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Tip', width: '100px', render: (note) => <Badge variant={TYPE_MAP[note.type].variant}>{TYPE_MAP[note.type].label}</Badge> },
    {
      key: 'contact',
      header: 'Cari / Kaynak',
      render: (note) => (
        <div>
          <p className="text-sm text-slate-200">{note.contact?.name ?? 'Cari yok'}</p>
          {note.salesOrder ? <p className="text-xs text-sky-400">Satış siparişi {note.salesOrder.number}</p> : note.purchaseOrder ? <p className="text-xs text-sky-400">Satın alma {note.purchaseOrder.number}</p> : <p className="text-xs text-slate-500">Bağlı sipariş yok</p>}
        </div>
      ),
    },
    {
      key: 'warehouse',
      header: 'Depo / Taşıyıcı',
      width: '190px',
      render: (note) => (
        <div>
          <p className="text-sm text-slate-300">{note.warehouse?.code ? `${note.warehouse.code} - ${note.warehouse.name}` : note.warehouse?.name ?? 'Depo yok'}</p>
          <p className="text-xs text-slate-500">{note.carrier ?? 'Taşıyıcı yok'}{note.trackingNumber ? ` · ${note.trackingNumber}` : ''}</p>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Miktar',
      width: '150px',
      render: (note) => {
        const q = quantityState(note);
        return (
          <div>
            <div className="flex items-center justify-between gap-2 text-xs"><span className="text-slate-400">{q.label}</span><Badge variant={q.variant}>%{q.progress}</Badge></div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-800"><div className="h-1.5 rounded-full bg-emerald-400" style={{ width: `${q.progress}%` }} /></div>
          </div>
        );
      },
    },
    { key: 'status', header: 'Durum', width: '135px', render: (note) => <Badge variant={STATUS_MAP[note.status].variant} dot>{STATUS_MAP[note.status].label}</Badge> },
    { key: 'ewaybill', header: 'E-belge', width: '130px', render: (note) => <EWaybillState note={note} /> },
    { key: 'actions', header: '', width: '72px', align: 'right', render: (note) => <RowActions actions={getRowActions(note)} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="İrsaliyeler"
        subtitle="Sevk, teslimat ve e-irsaliye akışını yönetin."
        action={
          <Link href="/dashboard/delivery-notes/new">
            <Button leftIcon={<Plus className="h-4 w-4" />}>Yeni irsaliye</Button>
          </Link>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Toplam" value={String(kpis.total)} detail="Tüm filtre sonucu" icon={FileText} />
        <KpiCard label="Taslak" value={String(kpis.draft)} detail="Onay bekliyor" icon={CalendarDays} tone="warning" />
        <KpiCard label="Sevke hazır" value={String(kpis.ready)} detail="Stok etkisi öncesi" icon={PackageCheck} tone="info" />
        <KpiCard label="Yolda" value={String(kpis.shipped)} detail="Teslim bekliyor" icon={Truck} tone="warning" />
        <KpiCard label="Teslim" value={String(kpis.delivered)} detail="Kapanan irsaliyeler" icon={ClipboardCheck} tone="success" />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_160px_170px_150px_150px_150px]">
          <Input placeholder="İrsaliye no, cari, depo, taşıyıcı, takip no ara..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} prefixIcon={<Search className="h-4 w-4" />} />
          <Select label="" options={TYPE_OPTIONS} value={typeFilter} onChange={(event) => { setTypeFilter(parseType(event.target.value)); setPage(1); }} />
          <Select label="" options={STATUS_OPTIONS} value={statusFilter} onChange={(event) => { setStatusFilter(parseStatus(event.target.value)); setPage(1); }} />
          <Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} />
          <Input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} />
          <Input placeholder="Taşıyıcı" value={carrier} onChange={(event) => { setCarrier(event.target.value); setPage(1); }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {QUICK_STATUSES.map((item) => (
              <button key={item.value || 'all'} type="button" onClick={() => { setStatusFilter(item.value); setPage(1); }} className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors', statusFilter === item.value ? 'border-sky-500/40 bg-sky-500/15 text-sky-200' : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200')}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant={tableDensity === 'compact' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTableDensity('compact')}>Sıkı</Button>
            <Button variant={tableDensity === 'comfortable' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTableDensity('comfortable')}>Rahat</Button>
            <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />}>Dışa aktar</Button>
          </div>
        </div>
        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
            {activeFilters.map((filter) => <Badge key={filter} variant="neutral">{filter}</Badge>)}
            <Button variant="ghost" size="sm" onClick={clearFilters}>Temizle</Button>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={notes}
        keyExtractor={(note) => note.id}
        isLoading={isLoading}
        onRowClick={(note) => setDetailNote(note)}
        emptyTitle="İrsaliye bulunamadı"
        emptyDescription="Filtreleri temizleyin veya yeni bir irsaliye oluşturarak başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
        density={tableDensity}
      />

      <DetailModal note={detailNote} onClose={() => setDetailNote(null)} />

      <Modal
        isOpen={!!transitionNote && !!selectedTransition}
        onClose={() => setTransitionNote(null)}
        title={selectedTransition?.label ?? 'Durum güncelle'}
        description={transitionNote ? `${transitionNote.number} için stok ve teslimat etkisini onaylayın.` : undefined}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setTransitionNote(null)}>Vazgeç</Button>
            <Button size="sm" loading={updateStatus.isPending} onClick={confirmTransition}>Onayla</Button>
          </>
        }
      >
        {transitionNote && selectedTransition && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
              {selectedTransition.impact} Bu işlem stok hareketlerini etkileyebilir.
            </div>
            {selectedTransition.dateField && (
              <Input label={selectedTransition.dateField === 'shippedAt' ? 'Sevk tarihi' : 'Teslim tarihi'} type="date" value={transitionDate} onChange={(event) => setTransitionDate(event.target.value)} required />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
