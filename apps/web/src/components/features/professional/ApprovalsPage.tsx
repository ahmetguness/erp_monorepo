'use client';

import { useState } from 'react';
import { Plus, CheckCircle, XCircle, GitBranch } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useApprovalFlows, useCreateApprovalFlow, useDeleteApprovalFlow, useApprovalRequests, useAddApprovalAction } from '@/hooks/useApprovals';
import { formatDate } from '@/lib/utils';
import type { ApprovalFlow, ApprovalRequest, ApprovalModule } from '@/services/approval.service';

const MODULE_MAP: Record<string, string> = {
  PURCHASE_REQUEST: 'Satın Alma Talebi', LEAVE_REQUEST: 'İzin Talebi', INVOICE: 'Fatura',
  SALES_ORDER: 'Satış Siparişi', PURCHASE_ORDER: 'Satın Alma Siparişi', SERVICE_REQUEST: 'Servis Talebi', OTHER: 'Diğer',
};
const STATUS_MAP: Record<string, { label: string; variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  PENDING: { label: 'Bekliyor', variant: 'warning' },
  APPROVED: { label: 'Onaylı', variant: 'success' },
  REJECTED: { label: 'Reddedildi', variant: 'danger' },
  CANCELLED: { label: 'İptal', variant: 'neutral' },
  ESCALATED: { label: 'Yükseltildi', variant: 'info' },
};

export function ApprovalsPage() {
  const [tab, setTab] = useState<'flows' | 'requests'>('flows');
  const [flowPage, setFlowPage] = useState(1);
  const [reqPage, setReqPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', module: 'PURCHASE_REQUEST' as ApprovalModule, stepName: '' });

  const { data: flowsData, isLoading: flowsLoading } = useApprovalFlows({ page: flowPage, limit: 20 });
  const { data: reqsData, isLoading: reqsLoading } = useApprovalRequests({ page: reqPage, limit: 20 });
  const createFlow = useCreateApprovalFlow();
  const deleteFlow = useDeleteApprovalFlow();
  const addAction = useAddApprovalAction();

  const flowColumns: ColumnDef<ApprovalFlow>[] = [
    { key: 'name', header: 'Akış Adı', render: (r) => <span className="text-white font-medium">{r.name}</span> },
    { key: 'module', header: 'Modül', width: '160px', render: (r) => <span className="text-slate-300 text-xs">{MODULE_MAP[r.module] ?? r.module}</span> },
    { key: 'steps', header: 'Adım', width: '70px', align: 'center', render: (r) => <span className="text-slate-300">{r.steps?.length ?? 0}</span> },
    { key: 'requests', header: 'Talep', width: '70px', align: 'center', render: (r) => <span className="text-slate-300">{r._count?.requests ?? 0}</span> },
    { key: 'isActive', header: 'Durum', width: '100px', render: (r) => r.isActive ? <Badge variant="success">Aktif</Badge> : <Badge variant="neutral">Pasif</Badge> },
    { key: 'actions', header: '', width: '80px', align: 'right',
      render: (r) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); deleteFlow.mutate(r.id); }}
          className="text-xs text-red-400 hover:text-red-300 transition-colors">Sil</button>
      ),
    },
  ];

  const reqColumns: ColumnDef<ApprovalRequest>[] = [
    { key: 'flow', header: 'Akış', render: (r) => <span className="text-white text-sm">{r.flow?.name ?? '—'}</span> },
    { key: 'module', header: 'Modül', width: '140px', render: (r) => <span className="text-slate-300 text-xs">{MODULE_MAP[r.flow?.module ?? ''] ?? r.flow?.module}</span> },
    { key: 'entityId', header: 'Kaynak', width: '120px', render: (r) => <span className="font-mono text-slate-500 text-xs">{r.entityId.slice(0, 8)}…</span> },
    { key: 'currentStep', header: 'Adım', width: '70px', align: 'center', render: (r) => <span className="text-slate-300">{r.currentStep}</span> },
    { key: 'status', header: 'Durum', width: '130px',
      render: (r) => { const s = STATUS_MAP[r.status]; return s ? <Badge variant={s.variant}>{s.label}</Badge> : <span>{r.status}</span>; } },
    { key: 'createdAt', header: 'Tarih', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.createdAt)}</span> },
    { key: 'actions', header: '', width: '160px', align: 'right',
      render: (r) => r.status === 'PENDING' ? (
        <div className="flex items-center justify-end gap-1">
          <button type="button" onClick={(e) => { e.stopPropagation(); addAction.mutate({ requestId: r.id, data: { actionType: 'APPROVE' } }); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
            <CheckCircle className="w-3 h-3" />Onayla
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); addAction.mutate({ requestId: r.id, data: { actionType: 'REJECT' } }); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors">
            <XCircle className="w-3 h-3" />Reddet
          </button>
        </div>
      ) : null,
    },
  ];

  return (
    <div>
      <PageHeader title="Onay Akışları" subtitle="Onay süreçlerini ve taleplerini yönetin."
        action={
          <button onClick={() => setCreateOpen(true)}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 transition-all duration-200 active:scale-[0.97]">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15"><Plus className="w-3.5 h-3.5" /></span>
            Yeni Akış
          </button>
        }
      />
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setTab('flows')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'flows' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'text-slate-400 hover:text-white'}`}>
          <GitBranch className="w-4 h-4 inline mr-1.5" />Akışlar
        </button>
        <button onClick={() => setTab('requests')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'requests' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'text-slate-400 hover:text-white'}`}>
          Talepler
        </button>
      </div>

      {tab === 'flows' && (
        <DataTable columns={flowColumns} data={flowsData?.data ?? []} keyExtractor={(r) => r.id} isLoading={flowsLoading}
          emptyTitle="Onay akışı bulunamadı" emptyDescription="Yeni bir onay akışı oluşturarak başlayın."
          pagination={flowsData ? { page: flowPage, pageSize: 20, total: flowsData.meta.total, totalPages: flowsData.meta.totalPages, onChange: setFlowPage } : undefined} />
      )}
      {tab === 'requests' && (
        <DataTable columns={reqColumns} data={reqsData?.data ?? []} keyExtractor={(r) => r.id} isLoading={reqsLoading}
          emptyTitle="Onay talebi bulunamadı" emptyDescription="Henüz onay talebi yok."
          pagination={reqsData ? { page: reqPage, pageSize: 20, total: reqsData.meta.total, totalPages: reqsData.meta.totalPages, onChange: setReqPage } : undefined} />
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Yeni Onay Akışı" size="sm"
        footer={<>
          <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
          <Button size="sm" loading={createFlow.isPending} onClick={() => {
            createFlow.mutate({
              name: form.name, module: form.module,
              steps: [{ stepOrder: 1, name: form.stepName || 'Onay Adımı 1' }],
            }, { onSuccess: () => setCreateOpen(false) });
          }}>Oluştur</Button>
        </>}>
        <div className="space-y-4">
          <Input label="Akış Adı" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <Select label="Modül" required options={Object.entries(MODULE_MAP).map(([k, v]) => ({ value: k, label: v }))}
            value={form.module} onChange={(e) => setForm((p) => ({ ...p, module: e.target.value as ApprovalModule }))} />
          <Input label="İlk Adım Adı" placeholder="Onay Adımı 1" value={form.stepName} onChange={(e) => setForm((p) => ({ ...p, stepName: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
