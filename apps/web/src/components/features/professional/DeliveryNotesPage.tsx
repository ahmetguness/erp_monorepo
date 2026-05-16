'use client';

import { useState } from 'react';
import { Plus, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { AttachmentPanel } from '@/components/shared/AttachmentPanel';
import { EntityImageManager } from '@/components/shared/EntityImageManager';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useDeliveryNotes, useUpdateDeliveryNoteStatus } from '@/hooks/useDeliveryNotes';
import { formatDate } from '@/lib/utils';
import type { DeliveryNote, DeliveryNoteStatus } from '@/services/delivery-note.service';

const TYPE_MAP: Record<string, string> = { OUTBOUND: 'Sevk', INBOUND: 'Giriş', RETURN: 'İade' };
const STATUS_MAP: Record<string, { label: string; variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  DRAFT: { label: 'Taslak', variant: 'warning' },
  CONFIRMED: { label: 'Onaylı', variant: 'info' },
  PARTIALLY_SHIPPED: { label: 'Kısmi Sevk', variant: 'info' },
  SHIPPED: { label: 'Sevk Edildi', variant: 'success' },
  DELIVERED: { label: 'Teslim Edildi', variant: 'success' },
  CANCELLED: { label: 'İptal', variant: 'neutral' },
};

export function DeliveryNotesPage() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detailNote, setDetailNote] = useState<DeliveryNote | null>(null);
  const { data, isLoading } = useDeliveryNotes({ page, limit: 20, type: typeFilter || undefined, status: statusFilter || undefined });
  const updateStatus = useUpdateDeliveryNoteStatus();

  const columns: ColumnDef<DeliveryNote>[] = [
    { key: 'number', header: 'İrsaliye No', width: '130px', render: (r) => <span className="font-mono text-sky-400">{r.number}</span> },
    { key: 'type', header: 'Tip', width: '80px', render: (r) => <span className="text-slate-300 text-xs">{TYPE_MAP[r.type] ?? r.type}</span> },
    { key: 'date', header: 'Tarih', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.date)}</span> },
    { key: 'contact', header: 'Cari', render: (r) => <span className="text-slate-300 text-sm">{r.contact?.name ?? '—'}</span> },
    { key: 'warehouse', header: 'Depo', width: '120px', render: (r) => <span className="text-slate-400 text-xs">{r.warehouse?.name ?? '—'}</span> },
    { key: 'items', header: 'Kalem', width: '70px', align: 'center', render: (r) => <span className="text-slate-300">{r._count?.items ?? 0}</span> },
    { key: 'status', header: 'Durum', width: '130px',
      render: (r) => { const s = STATUS_MAP[r.status]; return s ? <Badge variant={s.variant}>{s.label}</Badge> : <span>{r.status}</span>; } },
    { key: 'actions', header: '', width: '140px', align: 'right',
      render: (r) => {
        const next: Partial<Record<string, { label: string; status: DeliveryNoteStatus }>> = {
          DRAFT: { label: 'Onayla', status: 'CONFIRMED' },
          CONFIRMED: { label: 'Sevk Et', status: 'SHIPPED' },
          SHIPPED: { label: 'Teslim', status: 'DELIVERED' },
        };
        const n = next[r.status];
        if (!n) return null;
        return (
          <button type="button" onClick={(e) => { e.stopPropagation(); updateStatus.mutate({ id: r.id, status: n.status }); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
            <ArrowRight className="w-3 h-3" />{n.label}
          </button>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="İrsaliyeler" subtitle="Sevk ve teslimat irsaliyelerini yönetin."
        action={
          <Link href="/dashboard/delivery-notes/new"
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 transition-all duration-200 active:scale-[0.97]">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15"><Plus className="w-3.5 h-3.5" /></span>
            Yeni İrsaliye
          </Link>
        }
      />
      <div className="flex items-center gap-3 mb-4">
        <Select label="" options={[{ value: '', label: 'Tüm Tipler' }, { value: 'OUTBOUND', label: 'Sevk' }, { value: 'INBOUND', label: 'Giriş' }, { value: 'RETURN', label: 'İade' }]}
          value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} />
        <Select label="" options={[{ value: '', label: 'Tüm Durumlar' }, ...Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))]}
          value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} />
      </div>
      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        onRowClick={(r) => setDetailNote(r)}
        emptyTitle="İrsaliye bulunamadı" emptyDescription="Yeni bir irsaliye oluşturarak başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />
      <Modal
        isOpen={!!detailNote}
        onClose={() => setDetailNote(null)}
        title={detailNote ? `İrsaliye ${detailNote.number}` : 'İrsaliye'}
        size="lg"
        footer={<Button variant="ghost" size="sm" onClick={() => setDetailNote(null)}>Kapat</Button>}
      >
        {detailNote && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Tip', value: TYPE_MAP[detailNote.type] ?? detailNote.type },
                { label: 'Durum', value: STATUS_MAP[detailNote.status]?.label ?? detailNote.status },
                { label: 'Cari', value: detailNote.contact?.name ?? '—' },
                { label: 'Tarih', value: formatDate(detailNote.date) },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
                  <p className="text-[10px] text-slate-500">{item.label}</p>
                  <p className="mt-1 text-sm text-slate-200">{item.value}</p>
                </div>
              ))}
            </div>
            <EntityImageManager
              entityType="DELIVERY_NOTE"
              entityId={detailNote.id}
              label="İrsaliye görseli"
              description="Teslimat evrakı, sevk belgesi veya imzalı irsaliye fotoğrafı yükleyin."
            />
            <AttachmentPanel entityType="DELIVERY_NOTE" entityId={detailNote.id} />
          </div>
        )}
      </Modal>
    </div>
  );
}
