'use client';

import { useState } from 'react';
import { Plus, ClipboardList, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { useWorkOrders } from '@/hooks/useProduction';
import { formatDate } from '@/lib/utils';
import type { WorkOrder } from '@/services/production.service';

const STATUS_MAP: Record<string, { label: string; variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  PLANNED: { label: 'Planlandı', variant: 'info' },
  IN_PROGRESS: { label: 'Devam Ediyor', variant: 'warning' },
  PAUSED: { label: 'Duraklatıldı', variant: 'neutral' },
  COMPLETED: { label: 'Tamamlandı', variant: 'success' },
  CANCELLED: { label: 'İptal', variant: 'danger' },
};

export function WorkOrdersPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data, isLoading } = useWorkOrders({ page, limit: 20, ...(statusFilter && { status: statusFilter }) });

  const columns: ColumnDef<WorkOrder>[] = [
    { key: 'number', header: 'No', width: '120px', render: (r) => <span className="font-mono text-sky-400">{r.number}</span> },
    {
      key: 'product', header: 'Ürün',
      render: (r) => (
        <div>
          <span className="text-white text-sm font-medium">{r.product?.name ?? '—'}</span>
          {r.bom && <span className="block text-xs text-slate-500">{r.bom.name} v{r.bom.version}</span>}
        </div>
      ),
    },
    {
      key: 'qty', header: 'Miktar', width: '140px',
      render: (r) => (
        <div className="text-right">
          <span className="text-white font-medium">{r.producedQty}</span>
          <span className="text-slate-500"> / {r.plannedQty}</span>
        </div>
      ),
    },
    {
      key: 'status', header: 'Durum', width: '130px',
      render: (r) => { const s = STATUS_MAP[r.status]; return s ? <Badge variant={s.variant}>{s.label}</Badge> : <span>{r.status}</span>; },
    },
    { key: 'startDate', header: 'Başlangıç', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{r.startDate ? formatDate(r.startDate) : '—'}</span> },
    { key: 'items', header: 'Malzeme', width: '80px', align: 'center', render: (r) => <span className="text-slate-400">{r._count?.items ?? 0}</span> },
    {
      key: 'actions', header: '', width: '50px', align: 'right',
      render: (r) => (
        <button onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/production/work-orders/${r.id}`); }}
          className="p-1.5 rounded-lg text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 transition-colors" aria-label="Detay">
          <Eye className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  const statuses = ['', 'PLANNED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED'];

  return (
    <div>
      <PageHeader title="İş Emirleri" subtitle="Üretim iş emirlerini takip edin."
        action={
          <Link href="/dashboard/production/work-orders/new"
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 transition-all duration-200 active:scale-[0.97]">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15"><Plus className="w-3.5 h-3.5" /></span>
            Yeni İş Emri
          </Link>
        } />

      {/* Status filter */}
      <div className="flex items-center gap-1 mb-5 bg-slate-900/50 border border-slate-800/60 rounded-xl p-1 w-fit">
        {statuses.map((s) => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === s ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
            {s ? (STATUS_MAP[s]?.label ?? s) : 'Tümü'}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        onRowClick={(r) => router.push(`/dashboard/production/work-orders/${r.id}`)}
        emptyTitle="İş emri bulunamadı" emptyDescription="Yeni bir iş emri oluşturarak başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />
    </div>
  );
}
