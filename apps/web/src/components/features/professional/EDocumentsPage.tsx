'use client';

import { useState } from 'react';
import { Plus, FileCheck, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { DeliveryNoteSelect, InvoiceSelect } from '@/components/shared/EntitySelect';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useEDocuments, useCreateEDocument, useUpdateEDocumentStatus } from '@/hooks/useEDocuments';
import { formatDate } from '@/lib/utils';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import type { EDocument, EDocumentStatus } from '@/services/e-document.service';

const TYPE_MAP: Record<string, string> = { E_INVOICE: 'E-Fatura', E_ARCHIVE: 'E-Arşiv', E_WAYBILL: 'E-İrsaliye' };
const STATUS_MAP: Record<string, { label: string; variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  PENDING: { label: 'Bekliyor', variant: 'warning' },
  PROCESSING: { label: 'İşleniyor', variant: 'info' },
  SENT: { label: 'Gönderildi', variant: 'info' },
  ACCEPTED: { label: 'Kabul Edildi', variant: 'success' },
  REJECTED: { label: 'Reddedildi', variant: 'danger' },
  CANCELLED: { label: 'İptal', variant: 'neutral' },
  ERROR: { label: 'Hata', variant: 'danger' },
};

type EDocumentFormType = 'E_INVOICE' | 'E_ARCHIVE' | 'E_WAYBILL';
const TYPE_OPTIONS: Array<{ value: EDocumentFormType; label: string }> = [
  { value: 'E_INVOICE', label: TYPE_MAP.E_INVOICE },
  { value: 'E_ARCHIVE', label: TYPE_MAP.E_ARCHIVE },
  { value: 'E_WAYBILL', label: TYPE_MAP.E_WAYBILL },
];

export function EDocumentsPage() {
  const { isStarter } = usePlanFeatures();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<{ type: EDocumentFormType; invoiceId: string; deliveryNoteId: string }>({ type: 'E_INVOICE', invoiceId: '', deliveryNoteId: '' });

  const { data, isLoading } = useEDocuments({ page, limit: 20, type: typeFilter || undefined, status: statusFilter || undefined });
  const createDoc = useCreateEDocument();
  const updateStatus = useUpdateEDocumentStatus();

  const columns: ColumnDef<EDocument>[] = [
    { key: 'id', header: 'ID', width: '100px', render: (r) => <span className="font-mono text-sky-400 text-xs">{r.id.slice(0, 8)}…</span> },
    { key: 'type', header: 'Tip', width: '100px', render: (r) => <span className="text-slate-300 text-xs">{TYPE_MAP[r.type] ?? r.type}</span> },
    { key: 'invoice', header: 'Fatura', width: '120px', render: (r) => <span className="text-slate-400 text-xs">{r.invoice?.number ?? '—'}</span> },
    { key: 'deliveryNote', header: 'İrsaliye', width: '120px', render: (r) => <span className="text-slate-400 text-xs">{r.deliveryNote?.number ?? '—'}</span> },
    { key: 'uuid', header: 'UUID', width: '120px', render: (r) => <span className="font-mono text-slate-500 text-xs">{r.uuid?.slice(0, 8) ?? '—'}</span> },
    { key: 'status', header: 'Durum', width: '130px',
      render: (r) => { const s = STATUS_MAP[r.status]; return s ? <Badge variant={s.variant}>{s.label}</Badge> : <span>{r.status}</span>; } },
    { key: 'retryCount', header: 'Deneme', width: '70px', align: 'center', render: (r) => <span className="text-slate-400 text-xs">{r.retryCount}</span> },
    { key: 'createdAt', header: 'Tarih', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.createdAt)}</span> },
    { key: 'actions', header: '', width: '100px', align: 'right',
      render: (r) => r.status === 'ERROR' ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); updateStatus.mutate({ id: r.id, status: 'PENDING' }); }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors">
          <RefreshCw className="w-3 h-3" />Tekrar
        </button>
      ) : null,
    },
  ];

  const filteredTypeOptions = TYPE_OPTIONS.filter(o => !isStarter || o.value !== 'E_WAYBILL');

  return (
    <div>
      <PageHeader title="E-Belgeler" subtitle="E-Fatura, E-Arşiv ve E-İrsaliye belgelerini yönetin."
        action={
          <button onClick={() => setCreateOpen(true)}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 transition-all duration-200 active:scale-[0.97]">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15"><Plus className="w-3.5 h-3.5" /></span>
            Yeni E-Belge
          </button>
        }
      />
      <div className="flex items-center gap-3 mb-4">
        <Select label="" options={[{ value: '', label: 'Tüm Tipler' }, ...Object.entries(TYPE_MAP).filter(([k]) => !isStarter || k !== 'E_WAYBILL').map(([k, v]) => ({ value: k, label: v }))]}
          value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} />
        <Select label="" options={[{ value: '', label: 'Tüm Durumlar' }, ...Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))]}
          value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} />
      </div>
      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        emptyTitle="E-Belge bulunamadı" emptyDescription="Yeni bir e-belge oluşturarak başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Yeni E-Belge" size="sm"
        footer={<>
          <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
          <Button size="sm" loading={createDoc.isPending} onClick={() => {
            createDoc.mutate({
              type: form.type,
              invoiceId: form.type !== 'E_WAYBILL' ? (form.invoiceId || undefined) : undefined,
              deliveryNoteId: form.type === 'E_WAYBILL' ? (form.deliveryNoteId || undefined) : undefined,
            }, { onSuccess: () => setCreateOpen(false) });
          }}>Oluştur</Button>
        </>}>
        <div className="space-y-4">
          <Select label="Belge Tipi" required options={filteredTypeOptions}
            value={form.type} onChange={(e) => {
              const nextType = filteredTypeOptions.find((option) => option.value === e.target.value)?.value ?? 'E_INVOICE';
              setForm((p) => ({ ...p, type: nextType, invoiceId: '', deliveryNoteId: '' }));
            }} />
          {(form.type === 'E_INVOICE' || form.type === 'E_ARCHIVE') && (
            <InvoiceSelect label="Fatura" value={form.invoiceId} onChange={(value) => setForm((p) => ({ ...p, invoiceId: value }))} />
          )}
          {form.type === 'E_WAYBILL' && (
            <DeliveryNoteSelect label="İrsaliye" value={form.deliveryNoteId} onChange={(value) => setForm((p) => ({ ...p, deliveryNoteId: value }))} />
          )}
        </div>
      </Modal>
    </div>
  );
}
