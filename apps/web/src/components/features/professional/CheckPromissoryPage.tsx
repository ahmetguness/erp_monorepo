'use client';

import { useState } from 'react';
import { ArrowRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { ApiErrorState } from '@/components/shared/ApiErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useCheckPromissoryNotes, useCreateCheckPromissory, useDeleteCheckPromissory, useUpdateCheckPromissory, useUpdateCheckStatus } from '@/hooks/useCheckPromissory';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { CheckNoteType, CheckPromissory, CheckStatus } from '@/services/check-promissory.service';

const TYPE_MAP = { CHECK: 'Çek', PROMISSORY_NOTE: 'Senet' } as const;
const STATUS_MAP: Record<CheckStatus, { label: string; variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  PENDING: { label: 'Bekliyor', variant: 'warning' }, DEPOSITED: { label: 'Bankaya Verildi', variant: 'info' },
  CLEARED: { label: 'Tahsil Edildi', variant: 'success' }, BOUNCED: { label: 'Karşılıksız', variant: 'danger' }, CANCELLED: { label: 'İptal', variant: 'neutral' },
};
const TRANSITIONS: Partial<Record<CheckStatus, { label: string; status: CheckStatus }[]>> = {
  PENDING: [{ label: 'Bankaya Ver', status: 'DEPOSITED' }, { label: 'İptal', status: 'CANCELLED' }],
  DEPOSITED: [{ label: 'Tahsil', status: 'CLEARED' }, { label: 'Karşılıksız', status: 'BOUNCED' }],
};
type FormState = { type: CheckNoteType; number: string; amount: string; issueDate: string; dueDate: string; bankName: string; notes: string };

export function CheckPromissoryPage() {
  const today = new Date().toISOString().slice(0, 10);
  const emptyForm: FormState = { type: 'CHECK', number: '', amount: '', issueDate: today, dueDate: '', bankName: '', notes: '' };
  const [page, setPage] = useState(1), [typeFilter, setTypeFilter] = useState(''), [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false), [editing, setEditing] = useState<CheckPromissory | null>(null), [deleting, setDeleting] = useState<CheckPromissory | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const query = useCheckPromissoryNotes({ page, limit: 20, type: typeFilter || undefined, status: statusFilter || undefined });
  const createNote = useCreateCheckPromissory(), updateNote = useUpdateCheckPromissory(), deleteNote = useDeleteCheckPromissory(), updateStatus = useUpdateCheckStatus();

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (note: CheckPromissory) => {
    setEditing(note);
    setForm({ type: note.type, number: note.number, amount: String(note.amount), issueDate: note.issueDate.slice(0, 10), dueDate: note.dueDate.slice(0, 10), bankName: note.bankName ?? '', notes: note.notes ?? '' });
    setModalOpen(true);
  };
  const submit = () => {
    const common = { amount: Number(form.amount), dueDate: form.dueDate, bankName: form.bankName || undefined, notes: form.notes || undefined };
    const options = { onSuccess: () => setModalOpen(false) };
    if (editing) updateNote.mutate({ id: editing.id, data: common }, options);
    else createNote.mutate({ ...common, type: form.type, number: form.number, issueDate: form.issueDate }, options);
  };

  const columns: ColumnDef<CheckPromissory>[] = [
    { key: 'number', header: 'No', width: '120px', render: (row) => <span className="font-mono text-sky-400">{row.number}</span> },
    { key: 'type', header: 'Tip', width: '80px', render: (row) => <Badge variant="info">{TYPE_MAP[row.type]}</Badge> },
    { key: 'amount', header: 'Tutar', width: '130px', align: 'right', render: (row) => <span className="font-medium tabular-nums text-white">{formatCurrency(row.amount, row.currencyCode)}</span> },
    { key: 'issueDate', header: 'Düzenleme', width: '100px', render: (row) => <span className="text-xs text-slate-400">{formatDate(row.issueDate)}</span> },
    { key: 'dueDate', header: 'Vade', width: '100px', render: (row) => <span className="text-xs text-slate-400">{formatDate(row.dueDate)}</span> },
    { key: 'bankName', header: 'Banka', width: '120px', render: (row) => <span className="text-xs text-slate-400">{row.bankName ?? '—'}</span> },
    { key: 'status', header: 'Durum', width: '130px', render: (row) => <Badge variant={STATUS_MAP[row.status].variant}>{STATUS_MAP[row.status].label}</Badge> },
    { key: 'actions', header: 'İşlemler', width: '240px', align: 'right', render: (row) => <div className="flex items-center justify-end gap-1">
      {(TRANSITIONS[row.status] ?? []).map((action) => <button key={action.status} type="button" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: row.id, status: action.status })} className="inline-flex items-center gap-1 rounded-lg border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-400 hover:bg-sky-500/20 disabled:opacity-50"><ArrowRight className="h-3 w-3" />{action.label}</button>)}
      {row.status === 'PENDING' && <><Button variant="ghost" size="sm" aria-label={`${row.number} düzenle`} onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="sm" aria-label={`${row.number} sil`} onClick={() => setDeleting(row)}><Trash2 className="h-4 w-4 text-red-400" /></Button></>}
    </div> },
  ];

  return <div>
    <PageHeader title="Çek / Senet" subtitle="Çek ve senet takibini yönetin." action={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>Yeni Çek/Senet</Button>} />
    <div className="mb-4 flex items-center gap-3">
      <Select label="" options={[{ value: '', label: 'Tüm Tipler' }, ...Object.entries(TYPE_MAP).map(([value, label]) => ({ value, label }))]} value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }} />
      <Select label="" options={[{ value: '', label: 'Tüm Durumlar' }, ...Object.entries(STATUS_MAP).map(([value, item]) => ({ value, label: item.label }))]} value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} />
    </div>
    {query.isError ? <ApiErrorState error={query.error} onRetry={() => void query.refetch()} /> : <DataTable columns={columns} data={query.data?.data ?? []} keyExtractor={(row) => row.id} isLoading={query.isLoading} emptyTitle="Çek/Senet bulunamadı" emptyDescription="Yeni bir çek veya senet ekleyerek başlayın." pagination={query.data ? { page, pageSize: 20, total: query.data.meta.total, totalPages: query.data.meta.totalPages, onChange: setPage } : undefined} />}
    <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Çek / Senet Düzenle' : 'Yeni Çek / Senet'} size="md" footer={<><Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>İptal</Button><Button size="sm" loading={createNote.isPending || updateNote.isPending} onClick={submit}>Kaydet</Button></>}>
      <div className="space-y-4">
        <Select label="Tip" required disabled={Boolean(editing)} options={Object.entries(TYPE_MAP).map(([value, label]) => ({ value, label }))} value={form.type} onChange={(event) => setForm((previous) => ({ ...previous, type: event.target.value as CheckNoteType }))} />
        <Input label="Numara" required disabled={Boolean(editing)} value={form.number} onChange={(event) => setForm((previous) => ({ ...previous, number: event.target.value }))} />
        <Input label="Tutar" required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm((previous) => ({ ...previous, amount: event.target.value }))} />
        <div className="grid grid-cols-2 gap-3"><DatePicker label="Düzenleme Tarihi" required disabled={Boolean(editing)} value={form.issueDate} onValueChange={(value) => setForm((previous) => ({ ...previous, issueDate: value ?? '' }))} clearable={false} /><DatePicker label="Vade Tarihi" required value={form.dueDate} onValueChange={(value) => setForm((previous) => ({ ...previous, dueDate: value ?? '' }))} clearable={false} /></div>
        <Input label="Banka" value={form.bankName} onChange={(event) => setForm((previous) => ({ ...previous, bankName: event.target.value }))} />
        <Input label="Notlar" value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} />
      </div>
    </Modal>
    <ConfirmDialog isOpen={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={() => deleting && deleteNote.mutate(deleting.id, { onSuccess: () => setDeleting(null) })} title="Çek / Senet Sil" message={<><strong>{deleting?.number}</strong> numaralı kayıt silinecek.</>} confirmLabel="Sil" isLoading={deleteNote.isPending} />
  </div>;
}
