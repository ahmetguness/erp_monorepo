'use client';

import { useState } from 'react';
import { Shield, Eye, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useAuditLogs } from '@/hooks/useAuditLogs';
import { cn, formatDate } from '@/lib/utils';
import type { AuditLog } from '@/services/audit-log.service';

const ACTION_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  CREATE: { label: 'Oluşturma', variant: 'success' },
  UPDATE: { label: 'Güncelleme', variant: 'info' },
  DELETE: { label: 'Silme', variant: 'danger' },
  APPROVE: { label: 'Onay', variant: 'success' },
  REJECT: { label: 'Red', variant: 'warning' },
  LOGIN: { label: 'Giriş', variant: 'neutral' },
  LOGOUT: { label: 'Çıkış', variant: 'neutral' },
  EXPORT: { label: 'Dışa Aktarma', variant: 'info' },
  OTHER: { label: 'Diğer', variant: 'neutral' },
};

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [moduleFilter, setModuleFilter] = useState('');
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const { data, isLoading } = useAuditLogs({ page, limit: 30, module: moduleFilter || undefined });

  const columns: ColumnDef<AuditLog>[] = [
    { key: 'createdAt', header: 'Tarih', width: '140px', render: (r) => (
      <span className="text-xs text-slate-400 tabular-nums">{new Date(r.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
    )},
    { key: 'action', header: 'İşlem', width: '120px', render: (r) => {
      const a = ACTION_MAP[r.action]; return a ? <Badge variant={a.variant}>{a.label}</Badge> : <span className="text-xs text-slate-400">{r.action}</span>;
    }},
    { key: 'module', header: 'Modül', width: '110px', render: (r) => <span className="text-xs text-slate-400">{r.module}</span> },
    { key: 'entityType', header: 'Kaynak', width: '110px', render: (r) => <span className="text-xs text-slate-500 font-mono">{r.entityType}</span> },
    { key: 'entityId', header: 'ID', width: '100px', render: (r) => <span className="text-[10px] text-slate-600 font-mono truncate block max-w-[90px]">{r.entityId}</span> },
    { key: 'detail', header: '', width: '60px', align: 'right', render: (r) => (
      <button onClick={(e) => { e.stopPropagation(); setDetail(r); }}
        className="p-1.5 rounded-lg text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 transition-colors">
        <Eye className="w-3.5 h-3.5" />
      </button>
    )},
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Denetim Kaydı" subtitle="Son 30 günlük işlem geçmişi (Starter plan)." />

      <div className="flex items-center gap-3">
        <select value={moduleFilter} onChange={(e) => { setModuleFilter(e.target.value); setPage(1); }}
          className="bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500">
          <option value="">Tüm Modüller</option>
          {['accounting', 'inventory', 'contacts', 'invoicing', 'reporting'].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        emptyTitle="Denetim kaydı bulunamadı"
        pagination={data ? { page, pageSize: 30, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />

      {/* Detail modal */}
      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title="İşlem Detayı" size="md">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-slate-500">İşlem</span><p className="text-slate-200 font-medium">{ACTION_MAP[detail.action]?.label ?? detail.action}</p></div>
              <div><span className="text-slate-500">Modül</span><p className="text-slate-200">{detail.module}</p></div>
              <div><span className="text-slate-500">Kaynak</span><p className="text-slate-200">{detail.entityType}</p></div>
              <div><span className="text-slate-500">Tarih</span><p className="text-slate-200">{new Date(detail.createdAt).toLocaleString('tr-TR')}</p></div>
            </div>
            {detail.oldValues != null && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Eski Değerler</p>
                <pre className="bg-slate-800 rounded-lg p-3 text-xs text-slate-300 overflow-auto max-h-40">{JSON.stringify(detail.oldValues, null, 2)}</pre>
              </div>
            )}
            {detail.newValues != null && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Yeni Değerler</p>
                <pre className="bg-slate-800 rounded-lg p-3 text-xs text-slate-300 overflow-auto max-h-40">{JSON.stringify(detail.newValues, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
