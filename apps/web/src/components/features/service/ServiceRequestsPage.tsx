'use client';

import { useMemo, useState } from 'react';
import { Plus, Wrench, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { SavedViewControls } from '@/components/shared/SavedViewControls';
import { ContactSelect, CustomerAssetSelect } from '@/components/shared/EntitySelect';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useServiceRequests, useCreateServiceRequest } from '@/hooks/useService';
import { formatDate } from '@/lib/utils';
import type { ServiceRequest } from '@/services/service.service';
import { getSavedViewFilterString, type SavedViewState } from '@/services/saved-view.service';

const STATUS_MAP: Record<string, { label: string; variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  OPEN: { label: 'Açık', variant: 'info' },
  IN_PROGRESS: { label: 'Devam Ediyor', variant: 'warning' },
  WAITING_PARTS: { label: 'Parça Bekliyor', variant: 'neutral' },
  WAITING_CUSTOMER: { label: 'Müşteri Bekliyor', variant: 'neutral' },
  COMPLETED: { label: 'Tamamlandı', variant: 'success' },
  CANCELLED: { label: 'İptal', variant: 'danger' },
};

const PRIORITY_MAP: Record<string, { label: string; variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  LOW: { label: 'Düşük', variant: 'neutral' },
  MEDIUM: { label: 'Orta', variant: 'info' },
  HIGH: { label: 'Yüksek', variant: 'warning' },
  CRITICAL: { label: 'Kritik', variant: 'danger' },
};

function parseServiceStatus(value: string): string {
  return STATUS_MAP[value] ? value : '';
}

function parseServicePriority(value: string): string {
  return PRIORITY_MAP[value] ? value : '';
}

export function ServiceRequestsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', priority: 'MEDIUM', contactId: '', customerAssetId: '' });

  const { data, isLoading } = useServiceRequests({
    page,
    limit: 20,
    ...(statusFilter && { status: statusFilter }),
    ...(priorityFilter && { priority: priorityFilter }),
  });
  const create = useCreateServiceRequest();
  const viewState = useMemo<SavedViewState>(() => ({
    filters: { statusFilter, priorityFilter },
    pageSize: 20,
  }), [priorityFilter, statusFilter]);

  const applyView = (state: SavedViewState) => {
    setStatusFilter(parseServiceStatus(getSavedViewFilterString(state, 'statusFilter')));
    setPriorityFilter(parseServicePriority(getSavedViewFilterString(state, 'priorityFilter')));
    setPage(1);
  };

  const columns: ColumnDef<ServiceRequest>[] = [
    { key: 'number', header: 'No', width: '110px', render: (r) => <span className="font-mono text-sky-400">{r.number}</span> },
    {
      key: 'subject', header: 'Konu',
      render: (r) => (
        <div>
          <span className="text-white text-sm font-medium">{r.subject}</span>
          {r.contact && <span className="block text-xs text-slate-500">{r.contact.name}</span>}
        </div>
      ),
    },
    {
      key: 'asset', header: 'Varlık', width: '160px',
      render: (r) => r.customerAsset ? (
        <div className="text-xs">
          <span className="text-slate-300">{r.customerAsset.name}</span>
          {r.customerAsset.serialNo && <span className="block text-slate-500 font-mono">{r.customerAsset.serialNo}</span>}
        </div>
      ) : <span className="text-slate-600">—</span>,
    },
    {
      key: 'priority', header: 'Öncelik', width: '100px',
      render: (r) => { const p = PRIORITY_MAP[r.priority]; return p ? <Badge variant={p.variant}>{p.label}</Badge> : <span>{r.priority}</span>; },
    },
    {
      key: 'status', header: 'Durum', width: '140px',
      render: (r) => { const s = STATUS_MAP[r.status]; return s ? <Badge variant={s.variant}>{s.label}</Badge> : <span>{r.status}</span>; },
    },
    { key: 'createdAt', header: 'Tarih', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.createdAt)}</span> },
    {
      key: 'actions', header: '', width: '50px', align: 'right',
      render: (r) => (
        <button onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/service/requests/${r.id}`); }}
          className="p-1.5 rounded-lg text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 transition-colors" aria-label="Detay">
          <Eye className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  const statuses = ['', 'OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'WAITING_CUSTOMER', 'COMPLETED', 'CANCELLED'];

  return (
    <div>
      <PageHeader title="Servis Talepleri" subtitle="Teknik servis taleplerini yönetin."
        action={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" />Yeni Talep</Button>} />

      <div className="flex items-center gap-1 mb-5 bg-slate-900/50 border border-slate-800/60 rounded-xl p-1 w-fit flex-wrap">
        {statuses.map((s) => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === s ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
            {s ? (STATUS_MAP[s]?.label ?? s) : 'Tümü'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <Select
          options={[
            { value: '', label: 'Tüm Öncelikler' },
            { value: 'LOW', label: PRIORITY_MAP.LOW.label },
            { value: 'MEDIUM', label: PRIORITY_MAP.MEDIUM.label },
            { value: 'HIGH', label: PRIORITY_MAP.HIGH.label },
            { value: 'CRITICAL', label: PRIORITY_MAP.CRITICAL.label },
          ]}
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(parseServicePriority(e.target.value));
            setPage(1);
          }}
          className="w-44"
        />
        <SavedViewControls module="service" listKey="service.requests" currentState={viewState} onApply={applyView} />
      </div>

      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        onRowClick={(r) => router.push(`/dashboard/service/requests/${r.id}`)}
        emptyTitle="Servis talebi bulunamadı" emptyDescription="Yeni bir servis talebi oluşturarak başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Yeni Servis Talebi" size="sm"
        footer={<><Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
          <Button size="sm" loading={create.isPending} disabled={!form.subject.trim()}
            onClick={() => create.mutate({
              subject: form.subject, description: form.description || undefined,
              priority: form.priority || undefined,
              contactId: form.contactId || undefined, customerAssetId: form.customerAssetId || undefined,
            }, { onSuccess: () => { setCreateOpen(false); setForm({ subject: '', description: '', priority: 'MEDIUM', contactId: '', customerAssetId: '' }); } })}>
            Oluştur</Button></>}>
        <div className="space-y-4">
          <Input label="Konu" required placeholder="ör. Ekran arızası" value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} />
          <Textarea label="Açıklama" placeholder="Detaylı açıklama" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          <Select label="Öncelik" options={[{ value: 'LOW', label: 'Düşük' }, { value: 'MEDIUM', label: 'Orta' }, { value: 'HIGH', label: 'Yüksek' }, { value: 'CRITICAL', label: 'Kritik' }]}
            value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} />
          <ContactSelect
            label="Müşteri"
            value={form.contactId}
            onChange={(value) => setForm((p) => ({ ...p, contactId: value, customerAssetId: '' }))}
          />
          <CustomerAssetSelect
            label="Varlık"
            value={form.customerAssetId}
            contactId={form.contactId || undefined}
            onChange={(value) => setForm((p) => ({ ...p, customerAssetId: value }))}
          />
        </div>
      </Modal>
    </div>
  );
}
