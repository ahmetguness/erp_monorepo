'use client';

import { useState } from 'react';
import { Plus, Unlock } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useReservations, useCreateReservation, useReleaseReservation } from '@/hooks/useReservations';
import { formatDate } from '@/lib/utils';
import type { Reservation, ReservationRefType } from '@/services/inventory-reservation.service';

const REF_MAP: Record<string, string> = { SALES_ORDER: 'Satış Siparişi', WORK_ORDER: 'İş Emri', PURCHASE_REQUEST: 'Satın Alma Talebi', OTHER: 'Diğer' };

export function ReservationsPage() {
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState('true');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ productId: '', warehouseId: '', quantity: '', refType: 'SALES_ORDER' as ReservationRefType, refId: '', notes: '' });

  const { data, isLoading } = useReservations({ page, limit: 20, active: activeFilter || undefined });
  const createRes = useCreateReservation();
  const releaseRes = useReleaseReservation();

  const columns: ColumnDef<Reservation>[] = [
    { key: 'product', header: 'Ürün', render: (r) => <span className="text-white text-sm">{r.product?.name ?? '—'}</span> },
    { key: 'warehouse', header: 'Depo', width: '120px', render: (r) => <span className="text-slate-400 text-xs">{r.warehouse?.name ?? '—'}</span> },
    { key: 'quantity', header: 'Miktar', width: '90px', align: 'right', render: (r) => <span className="text-white tabular-nums font-medium">{r.quantity}</span> },
    { key: 'refType', header: 'Kaynak', width: '140px', render: (r) => <span className="text-slate-300 text-xs">{REF_MAP[r.refType] ?? r.refType}</span> },
    { key: 'reservedAt', header: 'Tarih', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.reservedAt)}</span> },
    { key: 'status', header: 'Durum', width: '120px',
      render: (r) => r.releasedAt ? <Badge variant="neutral">Serbest</Badge> : <Badge variant="warning">Aktif</Badge> },
    { key: 'actions', header: '', width: '100px', align: 'right',
      render: (r) => !r.releasedAt ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); releaseRes.mutate(r.id); }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors">
          <Unlock className="w-3 h-3" />Serbest
        </button>
      ) : null,
    },
  ];

  return (
    <div>
      <PageHeader title="Stok Rezervasyonları" subtitle="Ürün rezervasyonlarını yönetin."
        action={
          <button onClick={() => setCreateOpen(true)}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 transition-all duration-200 active:scale-[0.97]">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15"><Plus className="w-3.5 h-3.5" /></span>
            Yeni Rezervasyon
          </button>
        }
      />
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setActiveFilter('true')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeFilter === 'true' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-slate-400 hover:text-white'}`}>Aktif</button>
        <button onClick={() => setActiveFilter('false')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeFilter === 'false' ? 'bg-slate-500/20 text-slate-300 border border-slate-500/30' : 'text-slate-400 hover:text-white'}`}>Serbest</button>
        <button onClick={() => setActiveFilter('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!activeFilter ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'text-slate-400 hover:text-white'}`}>Tümü</button>
      </div>
      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        emptyTitle="Rezervasyon bulunamadı" emptyDescription="Yeni bir rezervasyon oluşturarak başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Yeni Rezervasyon" size="md"
        footer={<>
          <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
          <Button size="sm" loading={createRes.isPending} onClick={() => {
            createRes.mutate({
              productId: form.productId, warehouseId: form.warehouseId,
              quantity: Number(form.quantity), refType: form.refType, refId: form.refId,
              notes: form.notes || undefined,
            }, { onSuccess: () => setCreateOpen(false) });
          }}>Oluştur</Button>
        </>}>
        <div className="space-y-4">
          <Input label="Ürün ID" required value={form.productId} onChange={(e) => setForm((p) => ({ ...p, productId: e.target.value }))} />
          <Input label="Depo ID" required value={form.warehouseId} onChange={(e) => setForm((p) => ({ ...p, warehouseId: e.target.value }))} />
          <Input label="Miktar" required type="number" step="1" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
          <Select label="Kaynak Tipi" required options={Object.entries(REF_MAP).map(([k, v]) => ({ value: k, label: v }))}
            value={form.refType} onChange={(e) => setForm((p) => ({ ...p, refType: e.target.value as ReservationRefType }))} />
          <Input label="Kaynak ID" required value={form.refId} onChange={(e) => setForm((p) => ({ ...p, refId: e.target.value }))} />
          <Input label="Notlar" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
