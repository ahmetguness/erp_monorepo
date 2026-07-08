'use client';

import { useState } from 'react';
import { CalendarClock, PackageCheck, Plus, ShoppingCart, Unlock } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
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
import { formatDate } from '@/lib/utils';
import type { Reservation, ReservationRefType } from '@/services/inventory-reservation.service';

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

export function ReservationsPage() {
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState('true');
  const [createOpen, setCreateOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
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

  const { data, isLoading } = useReservations({ page, limit: 20, active: activeFilter || undefined });
  const { data: report } = useReservationReport();
  const createRes = useCreateReservation();
  const releaseRes = useReleaseReservation();
  const releaseExpired = useReleaseExpiredReservations();
  const createFromOrder = useCreateReservationsFromSalesOrder();
  const orderResult = createFromOrder.data;

  const columns: ColumnDef<Reservation>[] = [
    { key: 'product', header: 'Ürün', render: (r) => <span className="text-white text-sm">{r.product?.name ?? '-'}</span> },
    { key: 'warehouse', header: 'Depo', width: '120px', render: (r) => <span className="text-slate-400 text-xs">{r.warehouse?.name ?? '-'}</span> },
    { key: 'quantity', header: 'Miktar', width: '90px', align: 'right', render: (r) => <span className="text-white tabular-nums font-medium">{formatQty(r.quantity)}</span> },
    { key: 'refType', header: 'Kaynak', width: '140px', render: (r) => <span className="text-slate-300 text-xs">{REF_MAP[r.refType] ?? r.refType}</span> },
    { key: 'expiresAt', header: 'Bitiş', width: '110px', render: (r) => <span className="text-slate-400 text-xs">{r.expiresAt ? formatDate(r.expiresAt) : '-'}</span> },
    { key: 'reservedAt', header: 'Tarih', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.reservedAt)}</span> },
    {
      key: 'status',
      header: 'Durum',
      width: '120px',
      render: (r) => {
        if (r.releasedAt) return <Badge variant="neutral">Serbest</Badge>;
        if (r.expiresAt && new Date(r.expiresAt) < new Date()) return <Badge variant="danger">Süresi aşmış</Badge>;
        return <Badge variant="warning">Aktif</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      width: '100px',
      align: 'right',
      render: (r) => !r.releasedAt ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); releaseRes.mutate(r.id); }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
        >
          <Unlock className="w-3 h-3" />Serbest
        </button>
      ) : null,
    },
  ];

  const reportColumns: ColumnDef<NonNullable<typeof report>['rows'][number]>[] = [
    { key: 'productName', header: 'Ürün', render: (r) => <span className="text-white text-sm">{r.productCode} - {r.productName}</span> },
    { key: 'warehouseName', header: 'Depo', width: '130px', render: (r) => <span className="text-slate-400 text-xs">{r.warehouseName}</span> },
    { key: 'activeQuantity', header: 'Aktif', width: '90px', align: 'right', render: (r) => <span className="text-amber-300 tabular-nums">{formatQty(r.activeQuantity)}</span> },
    { key: 'expiredQuantity', header: 'Süresi Aşan', width: '120px', align: 'right', render: (r) => <span className="text-red-300 tabular-nums">{formatQty(r.expiredQuantity)}</span> },
    { key: 'releasedQuantity', header: 'Serbest', width: '90px', align: 'right', render: (r) => <span className="text-slate-400 tabular-nums">{formatQty(r.releasedQuantity)}</span> },
    { key: 'earliestExpiry', header: 'İlk Bitiş', width: '110px', render: (r) => <span className="text-slate-400 text-xs">{r.earliestExpiry ? formatDate(r.earliestExpiry) : '-'}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Stok Rezervasyonları"
        subtitle="Ürün rezervasyonlarını yönetin."
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" leftIcon={<ShoppingCart className="h-4 w-4" />} onClick={() => setOrderOpen(true)}>
              Siparişten rezerve et
            </Button>
            <button
              onClick={() => setCreateOpen(true)}
              className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 transition-all duration-200 active:scale-[0.97]"
            >
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15"><Plus className="w-3.5 h-3.5" /></span>
              Yeni Rezervasyon
            </button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <PackageCheck className="h-4 w-4 text-amber-400" />
          <p className="mt-2 text-xs text-slate-500">Aktif Rezerve</p>
          <p className="text-xl font-bold text-white tabular-nums">{formatQty(report?.summary.activeQuantity ?? 0)}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <CalendarClock className="h-4 w-4 text-red-400" />
          <p className="mt-2 text-xs text-slate-500">Süresi Aşan</p>
          <p className="text-xl font-bold text-white tabular-nums">{formatQty(report?.summary.expiredQuantity ?? 0)}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <Unlock className="h-4 w-4 text-slate-400" />
          <p className="mt-2 text-xs text-slate-500">Serbest Bırakılan</p>
          <p className="text-xl font-bold text-white tabular-nums">{formatQty(report?.summary.releasedQuantity ?? 0)}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <Button
            variant="outline"
            className="w-full"
            leftIcon={<CalendarClock className="h-4 w-4" />}
            loading={releaseExpired.isPending}
            onClick={() => releaseExpired.mutate()}
          >
            Süresi aşanları bırak
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setActiveFilter('true')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeFilter === 'true' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-slate-400 hover:text-white'}`}>Aktif</button>
        <button onClick={() => setActiveFilter('false')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeFilter === 'false' ? 'bg-slate-500/20 text-slate-300 border border-slate-500/30' : 'text-slate-400 hover:text-white'}`}>Serbest</button>
        <button onClick={() => setActiveFilter('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!activeFilter ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'text-slate-400 hover:text-white'}`}>Tümü</button>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Rezervasyon bulunamadı"
        emptyDescription="Yeni bir rezervasyon oluşturarak başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-white">Rezerve Stok Raporu</h2>
        <DataTable
          columns={reportColumns}
          data={report?.rows ?? []}
          keyExtractor={(row) => `${row.productId}:${row.warehouseId}`}
          emptyTitle="Rezerve stok bulunamadı"
          emptyDescription="Aktif veya geçmiş rezervasyon olduğunda rapor görünür."
        />
      </div>

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
                createFromOrder.mutate(
                  {
                    orderId: orderForm.orderId,
                    warehouseId: orderForm.warehouseId,
                    allowPartial: orderForm.allowPartial,
                    expiresAt: orderForm.expiresAt || undefined,
                  },
                );
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
                  const status = STATUS_MAP[line.status];
                  return (
                    <div key={line.productId} className="flex items-center justify-between gap-3 rounded-md bg-slate-950 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-white">{line.productCode} - {line.productName}</p>
                        <p className="text-[11px] text-slate-500">İstenen {formatQty(line.requestedQuantity)} · Rezerve {formatQty(line.reservedQuantity)}</p>
                      </div>
                      <Badge variant={status.variant}>{status.label}</Badge>
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
        onClose={() => setCreateOpen(false)}
        title="Yeni Rezervasyon"
        size="md"
        footer={(
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
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
                }, { onSuccess: () => setCreateOpen(false) });
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
            options={Object.entries(REF_MAP).map(([k, v]) => ({ value: k, label: v }))}
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
