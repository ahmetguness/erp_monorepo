'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle, BriefcaseBusiness, CalendarClock, FilterX, PackageCheck,
  Plus, Search, ShoppingCart, Unlock,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ProductSelect, WarehouseSelect } from '@/components/shared/EntitySelect';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  useCreateReservation,
  useCreateReservationsFromSalesOrder,
  useReleaseExpiredReservations,
  useReleaseReservation,
  useReservationReport,
  useReservations,
} from '@/hooks/useReservations';
import { cn, formatDate } from '@/lib/utils';
import type { Reservation, ReservationRefType } from '@/services/inventory-reservation.service';

type StatusFilter = 'all' | 'active' | 'expired' | 'released';

const PAGE_SIZE = 20;
const EMPTY_RESERVATIONS: Reservation[] = [];

const REF_MAP: Record<ReservationRefType, string> = {
  SALES_ORDER: 'Satış Siparişi',
  WORK_ORDER: 'İş Emri',
  PURCHASE_REQUEST: 'Satın Alma Talebi',
  OTHER: 'Diğer',
};

const STATUS_MAP: Record<'FULL' | 'PARTIAL' | 'SKIPPED', { label: string; variant: 'success' | 'warning' | 'neutral' }> = {
  FULL: { label: 'Tam', variant: 'success' },
  PARTIAL: { label: 'Kısmi', variant: 'warning' },
  SKIPPED: { label: 'Atlandı', variant: 'neutral' },
};

function formatQty(value: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(value);
}

function todayInputDate(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}

function reservationStatus(reservation: Reservation): StatusFilter {
  if (reservation.releasedAt) return 'released';
  if (reservation.expiresAt && new Date(reservation.expiresAt) < new Date()) return 'expired';
  return 'active';
}

function statusLabel(status: StatusFilter): string {
  if (status === 'active') return 'Aktif';
  if (status === 'expired') return 'Süresi Aşan';
  if (status === 'released') return 'Serbest';
  return 'Tümü';
}

function ReservationStatusBadge({ reservation }: { reservation: Reservation }) {
  const status = reservationStatus(reservation);
  if (status === 'released') return <Badge variant="neutral">Serbest</Badge>;
  if (status === 'expired') return <Badge variant="warning">Süresi Aşan</Badge>;
  return <Badge variant="info">Aktif</Badge>;
}

function ExpiryText({ reservation }: { reservation: Reservation }) {
  if (!reservation.expiresAt) return <span className="text-slate-500">Süresiz</span>;
  const expired = reservationStatus(reservation) === 'expired';
  return <span className={cn('text-xs', expired ? 'font-medium text-amber-300' : 'text-slate-400')}>{formatDate(reservation.expiresAt)}</span>;
}

function SummarySkeleton() {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
      <div className="h-5 w-2/3 animate-pulse rounded bg-slate-800/80" />
    </div>
  );
}

function TableSkeleton({ rows = 5, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, row) => (
        <tr key={row} className="border-b border-slate-800/45 last:border-0">
          {Array.from({ length: cols }).map((__, col) => (
            <td key={col} className="px-4 py-3.5">
              <div className="h-3.5 animate-pulse rounded bg-slate-800/75" style={{ width: `${40 + ((row + col) % 3) * 18}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function ReservationsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>('active');
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [refType, setRefType] = useState('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [releaseTarget, setReleaseTarget] = useState<Reservation | null>(null);
  const [form, setForm] = useState({
    productId: '',
    warehouseId: '',
    quantity: '',
    refType: 'SALES_ORDER' as ReservationRefType,
    refId: '',
    notes: '',
    expiresAt: '',
    allowPartial: true,
  });
  const [orderForm, setOrderForm] = useState({
    orderId: '',
    warehouseId: '',
    expiresAt: '',
    allowPartial: true,
  });

  const activeParam = status === 'released' ? 'false' : status === 'all' ? undefined : 'true';
  const { data, isLoading } = useReservations({
    page,
    limit: PAGE_SIZE,
    active: activeParam,
    productId: productId || undefined,
    warehouseId: warehouseId || undefined,
    refType: refType || undefined,
  });
  const { data: report, isLoading: isReportLoading } = useReservationReport();
  const createRes = useCreateReservation();
  const releaseRes = useReleaseReservation();
  const releaseExpired = useReleaseExpiredReservations();
  const createFromOrder = useCreateReservationsFromSalesOrder();
  const orderResult = createFromOrder.data;
  const rows = data?.data ?? EMPTY_RESERVATIONS;

  const visibleRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return rows
      .filter((reservation) => status !== 'expired' || reservationStatus(reservation) === 'expired')
      .filter((reservation) => {
        if (!q) return true;
        const haystack = [
          reservation.product?.name,
          reservation.product?.code,
          reservation.warehouse?.name,
          reservation.refId,
          REF_MAP[reservation.refType],
          reservation.notes,
        ].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR');
        return haystack.includes(q);
      });
  }, [rows, search, status]);

  const reportRows = report?.rows ?? [];
  const productCount = reportRows.filter((row) => row.activeQuantity > 0 || row.expiredQuantity > 0).length;
  const expiredCount = report?.summary.expiredCount ?? 0;
  const hasFilters = Boolean(status !== 'active' || productId || warehouseId || refType || search);

  const clearFilters = () => {
    setStatus('active');
    setProductId('');
    setWarehouseId('');
    setRefType('');
    setSearch('');
    setPage(1);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setForm({ productId: '', warehouseId: '', quantity: '', refType: 'SALES_ORDER', refId: '', notes: '', expiresAt: '', allowPartial: true });
  };

  const releaseSelected = () => {
    if (!releaseTarget) return;
    releaseRes.mutate(releaseTarget.id, { onSuccess: () => setReleaseTarget(null) });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stok Rezervasyonları"
        subtitle="Ayrılmış stokları, rezervasyon kaynaklarını ve sürelerini yönetin."
        className="mb-0"
        action={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" leftIcon={<ShoppingCart className="h-4 w-4" />} onClick={() => setOrderOpen(true)}>
              Siparişten Rezerve Et
            </Button>
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              Yeni Rezervasyon
            </Button>
          </div>
        )}
      />

      {isReportLoading ? <SummarySkeleton /> : (
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="font-semibold tabular-nums text-slate-50">{formatQty(report?.summary.activeQuantity ?? 0)} AD <span className="text-[11px] font-medium uppercase text-slate-500">Aktif Rezerve</span></span>
            <span className="h-4 w-px bg-slate-800" />
            <span className={cn('font-semibold tabular-nums', expiredCount > 0 ? 'text-amber-300' : 'text-slate-200')}>{formatQty(report?.summary.expiredQuantity ?? 0)} AD <span className="text-[11px] font-medium uppercase text-slate-500">Süresi Aşan</span></span>
            <span className="h-4 w-px bg-slate-800" />
            <span className="tabular-nums text-slate-200">{formatQty(report?.summary.releasedQuantity ?? 0)} AD <span className="text-[11px] font-medium uppercase text-slate-500">Serbest</span></span>
            <span className="h-4 w-px bg-slate-800" />
            <span className="tabular-nums text-slate-200">{productCount} <span className="text-[11px] font-medium uppercase text-slate-500">Ürün</span></span>
          </div>
        </div>
      )}

      {expiredCount > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-100">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
            <span><strong className="font-semibold">{expiredCount}</strong> rezervasyonun süresi dolmuş.</span>
          </div>
          <Button variant="secondary" size="sm" loading={releaseExpired.isPending} leftIcon={<Unlock className="h-3.5 w-3.5" />} onClick={() => releaseExpired.mutate()}>
            Süresi Aşanları Serbest Bırak
          </Button>
        </div>
      )}

      <section>
        <div className="mb-3 rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(240px,1fr)_auto_210px_180px_170px_auto] xl:items-center">
            <Input aria-label="Ürün, kod veya kaynak ara" placeholder="Ürün, kod veya kaynak ara..." value={search} onChange={(event) => setSearch(event.target.value)} prefixIcon={<Search className="h-4 w-4" />} />
            <div className="inline-flex h-10 overflow-hidden rounded-xl border border-slate-700/75 bg-slate-950/35 p-1">
              {(['all', 'active', 'expired', 'released'] as StatusFilter[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => { setStatus(item); setPage(1); }}
                  className={cn(
                    'rounded-lg px-3 text-xs font-medium transition-colors',
                    status === item ? 'bg-sky-500/15 text-sky-300' : 'text-slate-500 hover:text-slate-200',
                  )}
                >
                  {statusLabel(item)}
                </button>
              ))}
            </div>
            <ProductSelect value={productId} onChange={(value) => { setProductId(value); setPage(1); }} placeholder="Tüm Ürünler" />
            <WarehouseSelect value={warehouseId} onChange={(value) => { setWarehouseId(value); setPage(1); }} placeholder="Tüm Depolar" />
            <select value={refType} onChange={(event) => { setRefType(event.target.value); setPage(1); }} aria-label="Kaynak filtresi" className="h-10 rounded-xl border border-slate-700/75 bg-slate-950/35 px-3.5 text-sm text-slate-200 outline-none transition-all duration-150 hover:border-slate-600/80 hover:bg-slate-900/60 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/35">
              <option value="">Tüm Kaynaklar</option>
              {Object.entries(REF_MAP).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {hasFilters && <Button variant="ghost" size="sm" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Temizle</Button>}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
          <div className="border-b border-slate-800/70 bg-slate-900/45 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Rezervasyonlar</h2>
            <p className="mt-0.5 text-xs text-slate-500">Aktif rezervasyonlar kullanılabilir stok miktarını etkiler.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-900/95">
                <tr className="border-b border-slate-800/80">
                  {['Ürün', 'Depo', 'Rezerve', 'Kaynak', 'Oluşturma', 'Bitiş', 'Durum', ''].map((header, index) => (
                    <th key={header || index} className={cn('px-4 py-3 text-left text-[11px] font-semibold uppercase text-slate-500', index === 2 && 'text-right', index === 6 && 'text-center')}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? <TableSkeleton cols={8} /> : visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center">
                      <p className="text-sm font-semibold text-slate-200">{hasFilters ? 'Filtrelerle eşleşen rezervasyon bulunamadı' : 'Aktif rezervasyon bulunmuyor'}</p>
                      <p className="mt-1 text-sm text-slate-500">{hasFilters ? 'Filtreleri temizleyerek tüm rezervasyonları görüntüleyin.' : 'Şu anda stok kullanılabilirliğini etkileyen aktif rezervasyon yok.'}</p>
                      {hasFilters ? (
                        <Button className="mt-4" size="sm" variant="secondary" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Filtreleri Temizle</Button>
                      ) : (
                        <Button className="mt-4" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateOpen(true)}>Yeni Rezervasyon</Button>
                      )}
                    </td>
                  </tr>
                ) : visibleRows.map((reservation) => (
                  <tr key={reservation.id} className="group border-b border-slate-800/45 transition-colors duration-150 last:border-b-0 hover:bg-sky-500/[0.04]">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-100">{reservation.product?.name ?? 'Ürün bilgisi yok'}</p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">{reservation.product?.code ?? '-'}</p>
                    </td>
                    <td className="px-4 py-3.5 text-slate-300">{reservation.warehouse?.name ?? '-'}</td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-slate-50">{formatQty(reservation.quantity)} AD</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-start gap-2">
                        <BriefcaseBusiness className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                        <div>
                          <p className="text-slate-200">{REF_MAP[reservation.refType] ?? reservation.refType}</p>
                          <p className="mt-0.5 font-mono text-xs text-sky-300">{reservation.refId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-400">{formatDate(reservation.reservedAt)}</td>
                    <td className="px-4 py-3.5"><ExpiryText reservation={reservation} /></td>
                    <td className="px-4 py-3.5 text-center"><ReservationStatusBadge reservation={reservation} /></td>
                    <td className="px-4 py-3.5 text-right">
                      {!reservation.releasedAt && (
                        <Button variant="ghost" size="sm" leftIcon={<Unlock className="h-3.5 w-3.5" />} onClick={() => setReleaseTarget(reservation)}>
                          Serbest Bırak
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && data.meta.totalPages > 1 && (
            <div className="flex flex-col gap-3 border-t border-slate-800/70 bg-slate-900/45 px-4 py-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <span>{(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, data.meta.total)} / {data.meta.total} rezervasyon</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Önceki</Button>
                <span className="min-w-16 text-center tabular-nums text-slate-300">{page} / {data.meta.totalPages}</span>
                <Button size="sm" variant="secondary" disabled={page >= data.meta.totalPages} onClick={() => setPage((prev) => Math.min(data.meta.totalPages, prev + 1))}>Sonraki</Button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Ürün Bazlı Rezervasyon Özeti</h2>
            <p className="mt-0.5 text-xs text-slate-500">Ürün ve depo bazında toplam rezervasyon durumu.</p>
          </div>
          <span className="text-xs text-slate-500">{reportRows.length} satır</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-900/95">
                <tr className="border-b border-slate-800/80">
                  {['Ürün', 'Depo', 'Rezerve', 'Süresi Aşan', 'Serbest', 'En Yakın Bitiş'].map((header, index) => (
                    <th key={header} className={cn('px-4 py-3 text-left text-[11px] font-semibold uppercase text-slate-500', [2, 3, 4].includes(index) && 'text-right')}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isReportLoading ? <TableSkeleton rows={4} cols={6} /> : reportRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center">
                      <p className="text-sm font-semibold text-slate-200">Rezerve stok bulunamadı</p>
                      <p className="mt-1 text-sm text-slate-500">Aktif veya geçmiş rezervasyon olduğunda özet görünür.</p>
                    </td>
                  </tr>
                ) : reportRows.map((row) => (
                  <tr key={`${row.productId}:${row.warehouseId}`} className="border-b border-slate-800/45 last:border-b-0">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-100">{row.productName}</p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">{row.productCode}</p>
                    </td>
                    <td className="px-4 py-3.5 text-slate-300">{row.warehouseName}</td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-slate-50">{formatQty(row.activeQuantity + row.expiredQuantity)} AD</td>
                    <td className={cn('px-4 py-3.5 text-right tabular-nums', row.expiredQuantity > 0 ? 'font-semibold text-amber-300' : 'text-slate-500')}>{formatQty(row.expiredQuantity)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-slate-500">{formatQty(row.releasedQuantity)}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-400">{row.earliestExpiry ? formatDate(row.earliestExpiry) : 'Süresiz'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <Modal
        isOpen={Boolean(releaseTarget)}
        onClose={() => setReleaseTarget(null)}
        title="Rezervasyon serbest bırakılsın mı?"
        description={releaseTarget ? `${releaseTarget.product?.name ?? 'Seçili ürün'} için ayrılan ${formatQty(releaseTarget.quantity)} AD stok tekrar kullanılabilir hale gelecek.` : undefined}
        footer={(
          <>
            <Button variant="ghost" size="sm" onClick={() => setReleaseTarget(null)}>Vazgeç</Button>
            <Button variant="danger" size="sm" loading={releaseRes.isPending} leftIcon={<Unlock className="h-3.5 w-3.5" />} onClick={releaseSelected}>
              {releaseTarget ? `${formatQty(releaseTarget.quantity)} AD Serbest Bırak` : 'Serbest Bırak'}
            </Button>
          </>
        )}
      >
        {releaseTarget && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">Ürün</p>
                <p className="mt-1 font-medium text-slate-100">{releaseTarget.product?.name ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Kaynak</p>
                <p className="mt-1 text-slate-100">{REF_MAP[releaseTarget.refType]} · <span className="font-mono text-sky-300">{releaseTarget.refId}</span></p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={orderOpen}
        onClose={() => setOrderOpen(false)}
        title="Siparişten Rezervasyon"
        size="lg"
        footer={(
          <>
            <Button variant="ghost" size="sm" onClick={() => setOrderOpen(false)}>İptal</Button>
            <Button
              size="sm"
              loading={createFromOrder.isPending}
              disabled={!orderForm.orderId || !orderForm.warehouseId}
              onClick={() => {
                createFromOrder.mutate({
                  orderId: orderForm.orderId,
                  warehouseId: orderForm.warehouseId,
                  allowPartial: orderForm.allowPartial,
                  expiresAt: orderForm.expiresAt || undefined,
                });
              }}
            >
              Rezerve Et
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Input label="Satış Siparişi ID" required value={orderForm.orderId} onChange={(e) => setOrderForm((p) => ({ ...p, orderId: e.target.value }))} />
          <WarehouseSelect label="Depo" required value={orderForm.warehouseId} onChange={(value) => setOrderForm((p) => ({ ...p, warehouseId: value }))} />
          <Input label="Rezervasyon Bitişi" type="date" min={todayInputDate()} value={orderForm.expiresAt} onChange={(e) => setOrderForm((p) => ({ ...p, expiresAt: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={orderForm.allowPartial}
              onChange={(e) => setOrderForm((p) => ({ ...p, allowPartial: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-sky-500"
            />
            Kısmi rezervasyona izin ver
          </label>
          {orderResult && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-sm font-semibold text-white">{orderResult.orderNumber} - {orderResult.warehouseName}</p>
              <p className="mt-1 text-xs text-slate-400">{formatQty(orderResult.totalReservedQuantity)} miktar rezerve edildi.</p>
              <div className="mt-3 space-y-2">
                {orderResult.lines.map((line) => {
                  const lineStatus = STATUS_MAP[line.status];
                  return (
                    <div key={line.productId} className="flex items-center justify-between gap-3 rounded-md bg-slate-950 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-white">{line.productCode} - {line.productName}</p>
                        <p className="text-[11px] text-slate-500">İstenen {formatQty(line.requestedQuantity)} · Rezerve {formatQty(line.reservedQuantity)}</p>
                      </div>
                      <Badge variant={lineStatus.variant}>{lineStatus.label}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={createOpen}
        onClose={closeCreate}
        title="Yeni Rezervasyon"
        size="md"
        footer={(
          <>
            <Button variant="ghost" size="sm" onClick={closeCreate}>İptal</Button>
            <Button
              size="sm"
              loading={createRes.isPending}
              disabled={!form.productId || !form.warehouseId || !form.quantity || !form.refId}
              onClick={() => {
                createRes.mutate({
                  productId: form.productId,
                  warehouseId: form.warehouseId,
                  quantity: Number(form.quantity),
                  refType: form.refType,
                  refId: form.refId,
                  notes: form.notes || undefined,
                  expiresAt: form.expiresAt || undefined,
                  allowPartial: form.allowPartial,
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
          <WarehouseSelect label="Depo" required value={form.warehouseId} onChange={(value) => setForm((p) => ({ ...p, warehouseId: value }))} />
          <Input label="Miktar" required type="number" step="0.001" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
          <Select
            label="Kaynak Tipi"
            required
            options={Object.entries(REF_MAP).map(([value, label]) => ({ value, label }))}
            value={form.refType}
            onChange={(e) => setForm((p) => ({ ...p, refType: e.target.value as ReservationRefType }))}
          />
          <Input label="Kaynak ID" required value={form.refId} onChange={(e) => setForm((p) => ({ ...p, refId: e.target.value }))} />
          <Input label="Rezervasyon Bitişi" type="date" min={todayInputDate()} value={form.expiresAt} onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.allowPartial}
              onChange={(e) => setForm((p) => ({ ...p, allowPartial: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-sky-500"
            />
            Kısmi rezervasyona izin ver
          </label>
          <Input label="Notlar" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
