'use client';

import { useMemo, useState } from 'react';
import { FileSearch, FilterX, Hash, Package, Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ProductBatchSelect, ProductSelect } from '@/components/shared/EntitySelect';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useCreateLotSerial, useLotSerialTraceability, useLotSerials } from '@/hooks/useLotSerials';
import { cn, formatDate } from '@/lib/utils';
import type { LotSerial, TraceabilityReportItem } from '@/services/lot-serial.service';

type UsedFilter = '' | 'false' | 'true';

const PAGE_SIZE = 20;
const EMPTY_LOTS: LotSerial[] = [];

const SOURCE_LABELS: Record<TraceabilityReportItem['sourceType'], string> = {
  LOT_SERIAL: 'Lot / Seri',
  PRODUCT_BATCH: 'Parti',
  STOCK_MOVEMENT: 'Stok Hareketi',
  DELIVERY_NOTE: 'İrsaliye',
  SALES_ORDER: 'Satış Siparişi',
  PURCHASE_ORDER: 'Satın Alma Siparişi',
  INVOICE: 'Fatura',
  WORK_ORDER: 'İş Emri',
  SERVICE_REQUEST: 'Servis',
  OTHER: 'Diğer',
};

function formatQty(value: number | null): string {
  if (value === null) return '-';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(value);
}

function formatEventDate(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function eventTone(item: TraceabilityReportItem): string {
  if (item.direction === 'IN') return 'border-emerald-400 bg-emerald-400';
  if (item.direction === 'OUT') return 'border-red-400 bg-red-400';
  if (item.sourceType === 'SERVICE_REQUEST') return 'border-amber-400 bg-amber-400';
  if (item.sourceType === 'WORK_ORDER') return 'border-violet-400 bg-violet-400';
  return 'border-sky-400 bg-sky-400';
}

function EventQuantity({ item }: { item: TraceabilityReportItem }) {
  if (item.quantity === null) return <span className="text-slate-600">-</span>;
  if (item.direction === 'IN') return <span className="tabular-nums text-emerald-300">+{formatQty(item.quantity)} AD</span>;
  if (item.direction === 'OUT') return <span className="tabular-nums text-red-300">-{formatQty(item.quantity)} AD</span>;
  return <span className="tabular-nums text-slate-300">{formatQty(item.quantity)} AD</span>;
}

function StatusBadge({ lot }: { lot: LotSerial }) {
  return lot.isUsed ? <Badge variant="neutral">Kullanıldı</Badge> : <Badge variant="success">Müsait</Badge>;
}

function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, row) => (
        <tr key={row} className="border-b border-slate-800/45 last:border-0">
          {Array.from({ length: cols }).map((__, col) => (
            <td key={col} className="px-4 py-3.5">
              <div className="h-3.5 animate-pulse rounded bg-slate-800/75" style={{ width: `${42 + ((row + col) % 3) * 18}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function LotSerialsPage() {
  const [page, setPage] = useState(1);
  const [usedFilter, setUsedFilter] = useState<UsedFilter>('');
  const [listSearch, setListSearch] = useState('');
  const [listBatchId, setListBatchId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ productId: '', batchId: '', serialNumber: '' });
  const [traceDraft, setTraceDraft] = useState({ productId: '', batchId: '', serialNumber: '' });
  const [traceFilters, setTraceFilters] = useState({ productId: '', batchId: '', lotId: '' });
  const [traceLabel, setTraceLabel] = useState('');

  const { data, isLoading } = useLotSerials({ page, limit: PAGE_SIZE, isUsed: usedFilter || undefined, batchId: listBatchId || undefined });
  const lots = data?.data ?? EMPTY_LOTS;
  const traceability = useLotSerialTraceability({
    productId: traceFilters.productId || undefined,
    batchId: traceFilters.batchId || undefined,
    lotId: traceFilters.lotId || undefined,
  });
  const report = traceability.data;
  const createLot = useCreateLotSerial();
  const selectedFilters = Boolean(traceFilters.productId || traceFilters.batchId || traceFilters.lotId);

  const filteredLots = useMemo(() => {
    const q = listSearch.trim().toLocaleLowerCase('tr-TR');
    return lots.filter((lot) => {
      if (!q) return true;
      const haystack = `${lot.serialNumber} ${lot.product?.name ?? ''} ${lot.product?.code ?? ''} ${lot.batch?.batchNumber ?? ''}`.toLocaleLowerCase('tr-TR');
      return haystack.includes(q);
    });
  }, [listSearch, lots]);

  const traceItems = useMemo(
    () => [...(report?.items ?? [])].sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      return aTime - bTime;
    }),
    [report?.items],
  );

  const selectedLot = useMemo(() => lots.find((lot) => lot.id === traceFilters.lotId) ?? null, [lots, traceFilters.lotId]);
  const hasListFilters = Boolean(usedFilter || listSearch || listBatchId);
  const hasTraceDraft = Boolean(traceDraft.productId || traceDraft.batchId || traceDraft.serialNumber);

  const applyTrace = () => {
    const serial = traceDraft.serialNumber.trim().toLocaleLowerCase('tr-TR');
    const matchingLot = serial
      ? lots.find((lot) => lot.serialNumber.toLocaleLowerCase('tr-TR') === serial || lot.id === traceDraft.serialNumber.trim())
      : null;
    setTraceFilters({
      productId: traceDraft.productId,
      batchId: traceDraft.batchId,
      lotId: matchingLot?.id ?? (serial ? traceDraft.serialNumber.trim() : ''),
    });
    setTraceLabel(matchingLot?.serialNumber ?? traceDraft.serialNumber.trim());
  };

  const traceLot = (lot: LotSerial) => {
    setTraceDraft({ productId: lot.productId, batchId: lot.batchId ?? '', serialNumber: lot.serialNumber });
    setTraceFilters({ productId: lot.productId, batchId: lot.batchId ?? '', lotId: lot.id });
    setTraceLabel(lot.serialNumber);
  };

  const clearTrace = () => {
    setTraceDraft({ productId: '', batchId: '', serialNumber: '' });
    setTraceFilters({ productId: '', batchId: '', lotId: '' });
    setTraceLabel('');
  };

  const clearListFilters = () => {
    setUsedFilter('');
    setListSearch('');
    setListBatchId('');
    setPage(1);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setForm({ productId: '', batchId: '', serialNumber: '' });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lot / Seri Numaraları"
        subtitle="Lot ve seri numaralarını izleyin, mevcut durumlarını ve hareket geçmişlerini görüntüleyin."
        className="mb-0"
        action={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Yeni Seri No</Button>}
      />

      <section className="rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
        <div className="mb-3 flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-sky-300" />
          <h2 className="text-sm font-semibold text-white">İzlenebilirlik Araması</h2>
        </div>
        <div className="grid gap-3 lg:grid-cols-[220px_220px_minmax(260px,1fr)_auto_auto] lg:items-center">
          <ProductSelect value={traceDraft.productId} onChange={(value) => setTraceDraft((prev) => ({ ...prev, productId: value, batchId: '', serialNumber: '' }))} placeholder="Ürün ara..." />
          <ProductBatchSelect value={traceDraft.batchId} productId={traceDraft.productId || undefined} onChange={(value) => setTraceDraft((prev) => ({ ...prev, batchId: value, serialNumber: '' }))} placeholder="Parti ara..." />
          <Input aria-label="Lot / Seri No ara" placeholder="Lot / Seri No ara..." value={traceDraft.serialNumber} onChange={(event) => setTraceDraft((prev) => ({ ...prev, serialNumber: event.target.value }))} prefixIcon={<Search className="h-4 w-4" />} />
          <Button onClick={applyTrace} disabled={!hasTraceDraft}>Ara</Button>
          {selectedFilters && <Button variant="ghost" leftIcon={<FilterX className="h-4 w-4" />} onClick={clearTrace}>Temizle</Button>}
        </div>
      </section>

      <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="font-semibold tabular-nums text-slate-50">{report?.summary.lotCount ?? 0} <span className="text-[11px] font-medium uppercase text-slate-500">Lot / Seri</span></span>
          <span className="h-4 w-px bg-slate-800" />
          <span className="tabular-nums text-slate-200">{report?.summary.batchCount ?? 0} <span className="text-[11px] font-medium uppercase text-slate-500">Parti</span></span>
          <span className="h-4 w-px bg-slate-800" />
          <span className="tabular-nums text-slate-200">{(report?.summary.movementCount ?? 0) + (report?.summary.deliveryCount ?? 0)} <span className="text-[11px] font-medium uppercase text-slate-500">Stok / İrsaliye</span></span>
          <span className="h-4 w-px bg-slate-800" />
          <span className="tabular-nums text-slate-200">{report?.summary.invoiceCount ?? 0} <span className="text-[11px] font-medium uppercase text-slate-500">Fatura</span></span>
          <span className="h-4 w-px bg-slate-800" />
          <span className="tabular-nums text-slate-200">{report?.summary.serviceCount ?? 0} <span className="text-[11px] font-medium uppercase text-slate-500">Servis</span></span>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
        <div className="border-b border-slate-800/70 bg-slate-900/45 px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">İzlenebilirlik</h2>
              <p className="mt-0.5 text-xs text-slate-500">Seçilen ürün, parti veya lot/seri numarasına ait hareket zinciri.</p>
            </div>
            {selectedFilters && (
              <span className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-300">
                İzleme: {traceLabel || selectedLot?.serialNumber || traceFilters.batchId || traceFilters.productId}
              </span>
            )}
          </div>
        </div>

        {selectedLot && (
          <div className="border-b border-slate-800/70 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="font-mono font-semibold text-sky-300">{selectedLot.serialNumber}</span>
              <span className="text-slate-300">{selectedLot.product?.name ?? 'Ürün bilgisi yok'} <span className="font-mono text-xs text-slate-500">{selectedLot.product?.code ?? ''}</span></span>
              <span className="font-mono text-xs text-slate-500">{selectedLot.batch?.batchNumber ?? 'Partisiz'}</span>
              <StatusBadge lot={selectedLot} />
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-900/95">
              <tr className="border-b border-slate-800/80">
                {['Tarih', 'Olay', 'Kayıt', 'Ürün / Kimlik', 'Miktar', 'Detay'].map((header, index) => (
                  <th key={header} className={cn('px-4 py-3 text-left text-[11px] font-semibold uppercase text-slate-500', index === 4 && 'text-right')}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {traceability.isLoading ? <TableSkeleton rows={4} cols={6} /> : !selectedFilters ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <FileSearch className="mx-auto h-8 w-8 text-slate-600" />
                    <p className="mt-3 text-sm font-semibold text-slate-200">İzlemek istediğiniz kaydı seçin</p>
                    <p className="mt-1 text-sm text-slate-500">Ürün, parti veya Lot / Seri No üzerinden tüm hareket zincirini görüntüleyebilirsiniz.</p>
                  </td>
                </tr>
              ) : traceItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <p className="text-sm font-semibold text-slate-200">{traceDraft.serialNumber ? 'Lot / Seri No bulunamadı' : 'İzlenebilirlik kaydı bulunamadı'}</p>
                    <p className="mt-1 text-sm text-slate-500">{traceDraft.serialNumber ? `"${traceDraft.serialNumber}" ile eşleşen kayıt yok.` : 'Bu seçim için henüz bağlantılı hareket kaydı oluşmamış.'}</p>
                    <Button className="mt-4" size="sm" variant="secondary" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearTrace}>Aramayı Temizle</Button>
                  </td>
                </tr>
              ) : traceItems.map((item) => (
                <tr key={item.id} className="border-b border-slate-800/45 last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-400">{formatEventDate(item.date)}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full', eventTone(item))} />
                      <span className="text-sm font-medium text-slate-100">{SOURCE_LABELS[item.sourceType]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-slate-100">{item.sourceLabel}</p>
                    <p className="mt-0.5 font-mono text-xs text-sky-300">{item.sourceNumber ?? item.sourceId}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-slate-300">{item.productName}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">{item.serialNumber ?? item.batchNumber ?? item.productCode}</p>
                  </td>
                  <td className="px-4 py-3.5 text-right"><EventQuantity item={item} /></td>
                  <td className="px-4 py-3.5 text-xs text-slate-500">{item.detail ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-white">Lot / Seri Kayıtları</h2>
          <p className="mt-0.5 text-xs text-slate-500">Sistemde kayıtlı lot ve seri numaraları.</p>
        </div>
        <div className="mb-3 rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto_220px_auto] lg:items-center">
            <Input aria-label="Seri no veya ürün ara" placeholder="Seri no veya ürün ara..." value={listSearch} onChange={(event) => setListSearch(event.target.value)} prefixIcon={<Search className="h-4 w-4" />} />
            <div className="inline-flex h-10 overflow-hidden rounded-xl border border-slate-700/75 bg-slate-950/35 p-1">
              {[
                { value: '', label: 'Tümü' },
                { value: 'false', label: 'Müsait' },
                { value: 'true', label: 'Kullanıldı' },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => { setUsedFilter(item.value as UsedFilter); setPage(1); }}
                  className={cn('rounded-lg px-3 text-xs font-medium transition-colors', usedFilter === item.value ? 'bg-sky-500/15 text-sky-300' : 'text-slate-500 hover:text-slate-200')}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <ProductBatchSelect value={listBatchId} onChange={(value) => { setListBatchId(value); setPage(1); }} placeholder="Tüm Partiler" />
            {hasListFilters && <Button variant="ghost" size="sm" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearListFilters}>Temizle</Button>}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-900/95">
                <tr className="border-b border-slate-800/80">
                  {['Seri No', 'Ürün', 'Parti', 'Durum', 'Kullanım', 'Oluşturma', ''].map((header, index) => (
                    <th key={header || index} className={cn('px-4 py-3 text-left text-[11px] font-semibold uppercase text-slate-500', index === 3 && 'text-center')}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? <TableSkeleton rows={5} cols={7} /> : filteredLots.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center">
                      <Hash className="mx-auto h-8 w-8 text-slate-600" />
                      <p className="mt-3 text-sm font-semibold text-slate-200">Lot/Seri numarası bulunamadı</p>
                      <p className="mt-1 text-sm text-slate-500">{hasListFilters ? 'Arama veya filtre kriterlerini değiştirin.' : 'Yeni bir seri numarası ekleyerek başlayın.'}</p>
                      {hasListFilters ? (
                        <Button className="mt-4" size="sm" variant="secondary" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearListFilters}>Filtreleri Temizle</Button>
                      ) : (
                        <Button className="mt-4" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateOpen(true)}>Yeni Seri No</Button>
                      )}
                    </td>
                  </tr>
                ) : filteredLots.map((lot) => (
                  <tr key={lot.id} className="group border-b border-slate-800/45 transition-colors duration-150 last:border-b-0 hover:bg-sky-500/[0.04]">
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <button type="button" onClick={() => traceLot(lot)} className="font-mono font-semibold text-sky-300 hover:text-sky-200">
                        {lot.serialNumber}
                      </button>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-100">{lot.product?.name ?? 'Ürün bilgisi yok'}</p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">{lot.product?.code ?? '-'}</p>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-400">{lot.batch?.batchNumber ?? '-'}</td>
                    <td className="px-4 py-3.5 text-center"><StatusBadge lot={lot} /></td>
                    <td className="px-4 py-3.5 text-xs text-slate-400">{lot.usedAt ? formatDate(lot.usedAt) : '-'}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-400">{formatDate(lot.createdAt)}</td>
                    <td className="px-4 py-3.5 text-right">
                      <Button variant="ghost" size="sm" leftIcon={<FileSearch className="h-3.5 w-3.5" />} onClick={() => traceLot(lot)}>İzle</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && data.meta.totalPages > 1 && (
            <div className="flex flex-col gap-3 border-t border-slate-800/70 bg-slate-900/45 px-4 py-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <span>{(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, data.meta.total)} / {data.meta.total} seri numarası</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Önceki</Button>
                <span className="min-w-16 text-center tabular-nums text-slate-300">{page} / {data.meta.totalPages}</span>
                <Button size="sm" variant="secondary" disabled={page >= data.meta.totalPages} onClick={() => setPage((prev) => Math.min(data.meta.totalPages, prev + 1))}>Sonraki</Button>
              </div>
            </div>
          )}
        </div>
      </section>

      <Modal
        isOpen={createOpen}
        onClose={closeCreate}
        title="Yeni Lot / Seri Numarası"
        size="sm"
        footer={(
          <>
            <Button variant="ghost" size="sm" onClick={closeCreate}>İptal</Button>
            <Button size="sm" loading={createLot.isPending} disabled={!form.productId || !form.serialNumber} onClick={() => {
              createLot.mutate({
                productId: form.productId,
                serialNumber: form.serialNumber,
                batchId: form.batchId || undefined,
              }, { onSuccess: closeCreate });
            }}>Oluştur</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <ProductSelect label="Ürün" required value={form.productId} onChange={(value) => setForm((p) => ({ ...p, productId: value, batchId: '' }))} />
          <Input label="Seri Numarası" required value={form.serialNumber} onChange={(e) => setForm((p) => ({ ...p, serialNumber: e.target.value }))} />
          <ProductBatchSelect label="Parti" value={form.batchId} productId={form.productId || undefined} onChange={(value) => setForm((p) => ({ ...p, batchId: value }))} />
        </div>
      </Modal>
    </div>
  );
}
