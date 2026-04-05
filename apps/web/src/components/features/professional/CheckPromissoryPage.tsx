'use client';

import { useState } from 'react';
import { Plus, FileText, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useCheckPromissoryNotes, useCreateCheckPromissory, useUpdateCheckStatus } from '@/hooks/useCheckPromissory';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { CheckPromissory, CheckNoteType, CheckStatus } from '@/services/check-promissory.service';

const TYPE_MAP: Record<string, string> = { CHECK: 'Çek', PROMISSORY_NOTE: 'Senet' };
const STATUS_MAP: Record<string, { label: string; variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  PENDING: { label: 'Bekliyor', variant: 'warning' },
  DEPOSITED: { label: 'Bankaya Verildi', variant: 'info' },
  CLEARED: { label: 'Tahsil Edildi', variant: 'success' },
  BOUNCED: { label: 'Karşılıksız', variant: 'danger' },
  CANCELLED: { label: 'İptal', variant: 'neutral' },
};

const TRANSITIONS: Record<string, { label: string; status: CheckStatus }[]> = {
  PENDING: [{ label: 'Bankaya Ver', status: 'DEPOSITED' }, { label: 'İptal', status: 'CANCELLED' }],
  DEPOSITED: [{ label: 'Tahsil', status: 'CLEARED' }, { label: 'Karşılıksız', status: 'BOUNCED' }],
};

export function CheckPromissoryPage() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ type: 'CHECK' as CheckNoteType, number: '', amount: '', issueDate: today, dueDate: '', bankName: '', notes: '' });

  const { data, isLoading } = useCheckPromissoryNotes({ page, limit: 20, type: typeFilter || undefined, status: statusFilter || undefined });
  const createNote = useCreateCheckPromissory();
  const updateStatus = useUpdateCheckStatus();

  const columns: ColumnDef<CheckPromissory>[] = [
    { key: 'number', header: 'No', width: '120px', render: (r) => <span className="font-mono text-sky-400">{r.number}</span> },
    { key: 'type', header: 'Tip', width: '80px', render: (r) => <Badge variant="info">{TYPE_MAP[r.type]}</Badge> },
    { key: 'amount', header: 'Tutar', width: '130px', align: 'right', render: (r) => <span className="text-white tabular-nums font-medium">{formatCurrency(r.amount)}</span> },
    { key: 'issueDate', header: 'Düzenleme', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.issueDate)}</span> },
    { key: 'dueDate', header: 'Vade', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.dueDate)}</span> },
    { key: 'bankName', header: 'Banka', width: '120px', render: (r) => <span className="text-slate-400 text-xs">{r.bankName ?? '—'}</span> },
    { key: 'status', header: 'Durum', width: '130px',
      render: (r) => { const s = STATUS_MAP[r.status]; return s ? <Badge variant={s.variant}>{s.label}</Badge> : <span>{r.status}</span>; } },
    { key: 'actions', header: '', width: '180px', align: 'right',
      render: (r) => {
        const actions = TRANSITIONS[r.status];
        if (!actions) return null;
        return (
          <div className="flex items-center justify-end gap-1">
            {actions.map((a) => (
              <button key={a.status} type="button" onClick={(e) => { e.stopPropagation(); updateStatus.mutate({ id: r.id, status: a.status }); }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-sky-400 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 transition-colors">
                <ArrowRight className="w-3 h-3" />{a.label}
              </button>
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Çek / Senet" subtitle="Çek ve senet takibini yönetin."
        action={
          <button onClick={() => setCreateOpen(true)}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 transition-all duration-200 active:scale-[0.97]">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15"><Plus className="w-3.5 h-3.5" /></span>
            Yeni Çek/Senet
          </button>
        }
      />
      <div className="flex items-center gap-3 mb-4">
        <Select label="" options={[{ value: '', label: 'Tüm Tipler' }, ...Object.entries(TYPE_MAP).map(([k, v]) => ({ value: k, label: v }))]}
          value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} />
        <Select label="" options={[{ value: '', label: 'Tüm Durumlar' }, ...Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))]}
          value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} />
      </div>
      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        emptyTitle="Çek/Senet bulunamadı" emptyDescription="Yeni bir çek veya senet ekleyerek başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Yeni Çek / Senet" size="md"
        footer={<>
          <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
          <Button size="sm" loading={createNote.isPending} onClick={() => {
            createNote.mutate({
              type: form.type, number: form.number, amount: Number(form.amount),
              issueDate: form.issueDate, dueDate: form.dueDate,
              bankName: form.bankName || undefined, notes: form.notes || undefined,
            }, { onSuccess: () => setCreateOpen(false) });
          }}>Kaydet</Button>
        </>}>
        <div className="space-y-4">
          <Select label="Tip" required options={Object.entries(TYPE_MAP).map(([k, v]) => ({ value: k, label: v }))}
            value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as CheckNoteType }))} />
          <Input label="Numara" required value={form.number} onChange={(e) => setForm((p) => ({ ...p, number: e.target.value }))} />
          <Input label="Tutar" required type="number" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Düzenleme Tarihi" required type="date" value={form.issueDate} onChange={(e) => setForm((p) => ({ ...p, issueDate: e.target.value }))} />
            <Input label="Vade Tarihi" required type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} />
          </div>
          <Input label="Banka" value={form.bankName} onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))} />
          <Input label="Notlar" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
