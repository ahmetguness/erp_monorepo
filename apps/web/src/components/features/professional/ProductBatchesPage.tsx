'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Boxes, ChevronRight, FilterX, Hash, Package, Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ProductSelect } from '@/components/shared/EntitySelect';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { useProductBatches, useCreateProductBatch } from '@/hooks/useProductBatches';
import { cn, formatDate } from '@/lib/utils';
import type { ProductBatch } from '@/services/product-batch.service';

type BatchStatus = 'all' | 'active' | 'empty' | 'expiring' | 'expired' | 'noExpiry';

const PAGE_SIZE = 20;
const EXPIRING_DAYS = 30;
const EMPTY_BATCHES: ProductBatch[] = [];

function formatQty(value: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(value);
}

function formatReadableDate(value: string | null | undefined): string {
  if (!value) return 'Süresiz';
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
}

function getBatchStatus(batch: ProductBatch): Exclude<BatchStatus, 'all'> {
  if (batch.quantity <= 0) return 'empty';
  const days = daysUntil(batch.expiryDate);
  if (days === null) return 'active';
  if (days < 0) return 'expired';
  if (days <= EXPIRING_DAYS) return 'expiring';
  return 'active';
}

function StatusBadge({ batch }: { batch: ProductBatch }) {
  const status = getBatchStatus(batch);
  if (status === 'empty') return <Badge variant="neutral">Tükendi</Badge>;
  if (status === 'expired') return <Badge variant="danger">Süresi Doldu</Badge>;
  if (status === 'expiring') return <Badge variant="warning">SKT Yaklaşıyor</Badge>;
  return <Badge variant="info">Aktif</Badge>;
}

function ExpiryCell({ batch }: { batch: ProductBatch }) {
  const days = daysUntil(batch.expiryDate);
  if (days === null) return <span className="text-xs text-slate-500">Süresiz</span>;
  if (days < 0) {
    return (
      <div>
        <p className="text-xs font-medium text-red-300">{formatReadableDate(batch.expiryDate)}</p>
        <p className="mt-0.5 text-[11px] text-red-400">{Math.abs(days)} gün önce doldu</p>
      </div>
    );
  }
  if (days <= EXPIRING_DAYS) {
    return (
      <div>
        <p className="text-xs font-medium text-amber-300">{formatReadableDate(batch.expiryDate)}</p>
        <p className="mt-0.5 text-[11px] text-amber-400">{days} gün kaldı</p>
      </div>
    );
  }
  return <span className="text-xs text-slate-400">{formatReadableDate(batch.expiryDate)}</span>;
}

function SummarySkeleton() {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
      <div className="h-5 w-2/3 animate-pulse rounded bg-slate-800/80" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, row) => (
        <tr key={row} className="border-b border-slate-800/45 last:border-0">
          {Array.from({ length: 7 }).map((__, col) => (
            <td key={col} className="px-4 py-3.5">
              <div className="h-3.5 animate-pulse rounded bg-slate-800/75" style={{ width: `${42 + ((row + col) % 3) * 18}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function ProductBatchesPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<ProductBatch | null>(null);
  const [productId, setProductId] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BatchStatus>('all');
  const [form, setForm] = useState({ productId: '', batchNumber: '', expiryDate: '', manufacturedAt: '', quantity: '', notes: '' });

  const { data, isLoading } = useProductBatches({ page, limit: PAGE_SIZE, productId: productId || undefined });
  const createBatch = useCreateProductBatch();
  const batches = data?.data ?? EMPTY_BATCHES;

  const filteredBatches = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return batches.filter((batch) => {
      const haystack = `${batch.batchNumber} ${batch.product?.name ?? ''} ${batch.product?.code ?? ''}`.toLocaleLowerCase('tr-TR');
      const matchesSearch = !q || haystack.includes(q);
      const batchStatus = getBatchStatus(batch);
      const matchesStatus = status === 'all' || (status === 'noExpiry' ? !batch.expiryDate : batchStatus === status);
      return matchesSearch && matchesStatus;
    });
  }, [batches, search, status]);

  const summary = useMemo(() => ({
    active: batches.filter((batch) => getBatchStatus(batch) === 'active' || getBatchStatus(batch) === 'expiring').length,
    totalQty: batches.reduce((sum, batch) => sum + batch.quantity, 0),
    lots: batches.reduce((sum, batch) => sum + (batch._count?.lots ?? 0), 0),
    expiring: batches.filter((batch) => getBatchStatus(batch) === 'expiring').length,
    expired: batches.filter((batch) => getBatchStatus(batch) === 'expired').length,
  }), [batches]);

  const hasFilters = Boolean(productId || search || status !== 'all');
  const clearFilters = () => {
    setProductId('');
    setSearch('');
    setStatus('all');
    setPage(1);
  };
  const closeCreate = () => {
    setCreateOpen(false);
    setForm({ productId: '', batchNumber: '', expiryDate: '', manufacturedAt: '', quantity: '', notes: '' });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ürün Partileri"
        subtitle="Ürün partilerini, stok durumlarını ve izlenebilirlik bilgilerini yönetin."
        className="mb-0"
        action={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Yeni Parti</Button>}
      />

      {isLoading ? <SummarySkeleton /> : (
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="font-semibold tabular-nums text-slate-50">{summary.active} <span className="text-[11px] font-medium uppercase text-slate-500">Aktif Parti</span></span>
            <span className="h-4 w-px bg-slate-800" />
            <span className="font-semibold tabular-nums text-slate-200">{formatQty(summary.totalQty)} AD <span className="text-[11px] font-medium uppercase text-slate-500">Toplam Miktar</span></span>
            <span className="h-4 w-px bg-slate-800" />
            <span className="tabular-nums text-slate-200">{summary.lots} <span className="text-[11px] font-medium uppercase text-slate-500">Lot / Seri</span></span>
            <span className="h-4 w-px bg-slate-800" />
            <span className={cn('tabular-nums', summary.expiring > 0 ? 'font-semibold text-amber-300' : 'text-slate-200')}>{summary.expiring} <span className="text-[11px] font-medium uppercase text-slate-500">SKT Yaklaşan</span></span>
          </div>
        </div>
      )}

      {summary.expiring > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-100">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
            <span><strong className="font-semibold">{summary.expiring}</strong> partinin son kullanma tarihi yaklaşıyor.</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setStatus('expiring')}>Görüntüle</Button>
        </div>
      )}

      <section>
        <div className="mb-3 rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_240px_180px_auto] lg:items-center">
            <Input aria-label="Parti no, ürün veya kod ara" placeholder="Parti no, ürün veya kod ara..." value={search} onChange={(event) => setSearch(event.target.value)} prefixIcon={<Search className="h-4 w-4" />} />
            <ProductSelect value={productId} onChange={(value) => { setProductId(value); setPage(1); }} placeholder="Tüm Ürünler" />
            <select value={status} onChange={(event) => setStatus(event.target.value as BatchStatus)} aria-label="Durum filtresi" className="h-10 rounded-xl border border-slate-700/75 bg-slate-950/35 px-3.5 text-sm text-slate-200 outline-none transition-all duration-150 hover:border-slate-600/80 hover:bg-slate-900/60 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/35">
              <option value="all">Tüm Durumlar</option>
              <option value="active">Aktif</option>
              <option value="empty">Tükendi</option>
              <option value="expiring">SKT Yaklaşan</option>
              <option value="expired">Süresi Doldu</option>
              <option value="noExpiry">Süresiz</option>
            </select>
            {hasFilters && <Button variant="ghost" size="sm" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Temizle</Button>}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-900/95">
                <tr className="border-b border-slate-800/80">
                  {['Parti', 'Ürün', 'Stok', 'Lot / Seri', 'Üretim', 'Son Kullanma', 'Durum', ''].map((header, index) => (
                    <th key={header || index} className={cn('px-4 py-3 text-left text-[11px] font-semibold uppercase text-slate-500', [2, 3].includes(index) && 'text-right', index === 6 && 'text-center')}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? <TableSkeleton /> : filteredBatches.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center">
                      <Boxes className="mx-auto h-8 w-8 text-slate-600" />
                      <p className="mt-3 text-sm font-semibold text-slate-200">{hasFilters ? 'Filtrelerle eşleşen parti bulunamadı' : 'Henüz ürün partisi bulunmuyor'}</p>
                      <p className="mt-1 text-sm text-slate-500">{hasFilters ? 'Arama veya filtre kriterlerini değiştirin.' : 'Parti bazlı stok ve izlenebilirlik takibine başlamak için ilk partiyi oluşturun.'}</p>
                      {hasFilters ? (
                        <Button className="mt-4" size="sm" variant="secondary" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Filtreleri Temizle</Button>
                      ) : (
                        <Button className="mt-4" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateOpen(true)}>İlk Partiyi Oluştur</Button>
                      )}
                    </td>
                  </tr>
                ) : filteredBatches.map((batch) => (
                  <tr
                    key={batch.id}
                    onClick={() => setSelectedBatch(batch)}
                    className="group cursor-pointer border-b border-slate-800/45 transition-colors duration-150 last:border-b-0 hover:bg-sky-500/[0.04]"
                  >
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono font-semibold text-sky-300">{batch.batchNumber}</td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-100">{batch.product?.name ?? 'Ürün bilgisi yok'}</p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">{batch.product?.code ?? '-'}</p>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-slate-50">{formatQty(batch.quantity)} AD</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-slate-300">{batch._count?.lots ?? 0} <span className="text-xs text-slate-500">lot/seri</span></td>
                    <td className="px-4 py-3.5 text-xs text-slate-400">{batch.manufacturedAt ? formatReadableDate(batch.manufacturedAt) : '-'}</td>
                    <td className="px-4 py-3.5"><ExpiryCell batch={batch} /></td>
                    <td className="px-4 py-3.5 text-center"><StatusBadge batch={batch} /></td>
                    <td className="w-10 px-4 py-3.5 text-right"><ChevronRight className="h-4 w-4 text-slate-600 opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && data.meta.totalPages > 1 && (
            <div className="flex flex-col gap-3 border-t border-slate-800/70 bg-slate-900/45 px-4 py-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <span>{(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, data.meta.total)} / {data.meta.total} parti</span>
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
        isOpen={Boolean(selectedBatch)}
        onClose={() => setSelectedBatch(null)}
        title="Parti Detayı"
        description={selectedBatch?.batchNumber}
        size="lg"
      >
        {selectedBatch && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold text-sky-300">{selectedBatch.batchNumber}</p>
                  <p className="mt-1 text-base font-semibold text-slate-100">{selectedBatch.product?.name ?? 'Ürün bilgisi yok'}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">{selectedBatch.product?.code ?? '-'}</p>
                </div>
                <StatusBadge batch={selectedBatch} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
                <Package className="mb-2 h-4 w-4 text-slate-500" />
                <p className="text-xs text-slate-500">Kalan Miktar</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-50">{formatQty(selectedBatch.quantity)} AD</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
                <Hash className="mb-2 h-4 w-4 text-slate-500" />
                <p className="text-xs text-slate-500">Lot / Seri</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-50">{selectedBatch._count?.lots ?? 0}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
                <Boxes className="mb-2 h-4 w-4 text-slate-500" />
                <p className="text-xs text-slate-500">Oluşturma</p>
                <p className="mt-1 text-sm font-medium text-slate-100">{formatDate(selectedBatch.createdAt)}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
                <p className="text-xs font-semibold text-slate-300">Tarihler</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Üretim Tarihi</span><span className="text-slate-200">{selectedBatch.manufacturedAt ? formatReadableDate(selectedBatch.manufacturedAt) : '-'}</span></div>
                  <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Son Kullanma</span><span className="text-slate-200">{formatReadableDate(selectedBatch.expiryDate)}</span></div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
                <p className="text-xs font-semibold text-slate-300">İzlenebilirlik</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Parti No</span><span className="font-mono text-sky-300">{selectedBatch.batchNumber}</span></div>
                  <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Lot / Seri Kaydı</span><span className="tabular-nums text-slate-200">{selectedBatch._count?.lots ?? 0}</span></div>
                </div>
              </div>
            </div>
            {selectedBatch.notes && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
                <p className="text-xs font-semibold text-slate-300">Notlar</p>
                <p className="mt-2 text-sm text-slate-400">{selectedBatch.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={createOpen}
        onClose={closeCreate}
        title="Yeni Ürün Partisi"
        size="md"
        footer={(
          <>
            <Button variant="ghost" size="sm" onClick={closeCreate}>İptal</Button>
            <Button
              size="sm"
              loading={createBatch.isPending}
              disabled={!form.productId || !form.batchNumber}
              onClick={() => {
                createBatch.mutate({
                  productId: form.productId,
                  batchNumber: form.batchNumber,
                  expiryDate: form.expiryDate || undefined,
                  manufacturedAt: form.manufacturedAt || undefined,
                  quantity: form.quantity ? Number(form.quantity) : undefined,
                  notes: form.notes || undefined,
                }, { onSuccess: closeCreate });
              }}
            >
              Oluştur
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <ProductSelect label="Ürün" required value={form.productId} onChange={(value) => setForm((p) => ({ ...p, productId: value }))} />
          <Input label="Parti Numarası" required value={form.batchNumber} onChange={(e) => setForm((p) => ({ ...p, batchNumber: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <DatePicker label="Üretim Tarihi" value={form.manufacturedAt} onValueChange={(value) => setForm((p) => ({ ...p, manufacturedAt: value ?? '' }))} />
            <DatePicker label="Son Kullanma Tarihi" value={form.expiryDate} onValueChange={(value) => setForm((p) => ({ ...p, expiryDate: value ?? '' }))} />
          </div>
          <Input label="Miktar" type="number" step="0.001" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
          <Input label="Notlar" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
