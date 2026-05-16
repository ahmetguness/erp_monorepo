'use client';

import { useState } from 'react';
import { Plus, CheckCircle, Lock } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { useReconciliations, useCreateReconciliation, useFinalizeReconciliation } from '@/hooks/useReconciliation';
import { formatDate } from '@/lib/utils';
import type { Reconciliation } from '@/services/reconciliation.service';

export function ReconciliationsPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ name: '', description: '', date: today });

  const { data, isLoading } = useReconciliations({ page, limit: 20, isFinalized: filter || undefined });
  const createRec = useCreateReconciliation();
  const finalize = useFinalizeReconciliation();

  const columns: ColumnDef<Reconciliation>[] = [
    { key: 'name', header: 'Mutabakat Adı', render: (r) => <span className="text-white font-medium">{r.name}</span> },
    { key: 'description', header: 'Açıklama', render: (r) => <span className="text-slate-400 text-xs truncate max-w-[200px] block">{r.description ?? '—'}</span> },
    { key: 'date', header: 'Tarih', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.date)}</span> },
    { key: 'lines', header: 'Satır', width: '70px', align: 'center', render: (r) => <span className="text-slate-300">{r._count?.lines ?? 0}</span> },
    { key: 'status', header: 'Durum', width: '130px',
      render: (r) => r.isFinalized
        ? <Badge variant="success"><Lock className="w-3 h-3 mr-1" />Tamamlandı</Badge>
        : <Badge variant="warning">Açık</Badge> },
    { key: 'actions', header: '', width: '120px', align: 'right',
      render: (r) => !r.isFinalized ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); finalize.mutate(r.id); }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
          <CheckCircle className="w-3 h-3" />Tamamla
        </button>
      ) : null,
    },
  ];

  return (
    <div>
      <PageHeader title="Mutabakat" subtitle="Hesap mutabakatlarını oluşturun ve yönetin."
        action={
          <button onClick={() => setCreateOpen(true)}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 transition-all duration-200 active:scale-[0.97]">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15"><Plus className="w-3.5 h-3.5" /></span>
            Yeni Mutabakat
          </button>
        }
      />
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => setFilter('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!filter ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'text-slate-400 hover:text-white'}`}>Tümü</button>
        <button onClick={() => setFilter('false')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === 'false' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-slate-400 hover:text-white'}`}>Açık</button>
        <button onClick={() => setFilter('true')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === 'true' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-white'}`}>Tamamlanan</button>
      </div>
      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        emptyTitle="Mutabakat bulunamadı" emptyDescription="Yeni bir mutabakat oluşturarak başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Yeni Mutabakat" size="sm"
        footer={<>
          <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
          <Button size="sm" loading={createRec.isPending} onClick={() => {
            createRec.mutate({ name: form.name, description: form.description || undefined, date: form.date },
              { onSuccess: () => setCreateOpen(false) });
          }}>Oluştur</Button>
        </>}>
        <div className="space-y-4">
          <Input label="Mutabakat Adı" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <Input label="Açıklama" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          <DatePicker label="Tarih" required value={form.date} onValueChange={(value) => setForm((p) => ({ ...p, date: value ?? '' }))} clearable={false} />
        </div>
      </Modal>
    </div>
  );
}
