'use client';

import { useState } from 'react';
import { Plus, Layers, Eye, ToggleLeft, ToggleRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useBOMs, useCreateBOM, useUpdateBOM } from '@/hooks/useProduction';
import type { BOM } from '@/services/production.service';

export function BOMsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ productId: '', name: '', version: '1.0' });

  const { data, isLoading } = useBOMs({ page, limit: 20 });
  const create = useCreateBOM();
  const update = useUpdateBOM();

  const columns: ColumnDef<BOM>[] = [
    {
      key: 'name', header: 'BOM',
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
            <Layers className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <div>
            <span className="text-white font-medium text-sm">{r.name}</span>
            <span className="block text-xs text-slate-500">v{r.version}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'product', header: 'Ürün',
      render: (r) => (
        <div>
          <span className="text-slate-200 text-sm">{r.product?.name ?? '—'}</span>
          <span className="block text-xs text-slate-500 font-mono">{r.product?.code}</span>
        </div>
      ),
    },
    { key: 'items', header: 'Malzeme', width: '90px', align: 'center', render: (r) => <span className="text-slate-400">{r._count?.items ?? 0}</span> },
    { key: 'routings', header: 'Operasyon', width: '90px', align: 'center', render: (r) => <span className="text-slate-400">{r._count?.routings ?? 0}</span> },
    { key: 'workOrders', header: 'İş Emri', width: '90px', align: 'center', render: (r) => <span className="text-slate-400">{r._count?.workOrders ?? 0}</span> },
    {
      key: 'isActive', header: 'Durum', width: '90px',
      render: (r) => r.isActive ? <Badge variant="success">Aktif</Badge> : <Badge variant="neutral">Pasif</Badge>,
    },
    {
      key: 'actions', header: '', width: '80px', align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/production/boms/${r.id}`); }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 transition-colors" aria-label="Detay">
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); update.mutate({ id: r.id, data: { isActive: !r.isActive } }); }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors" aria-label="Durum">
            {r.isActive ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Ürün Ağaçları (BOM)" subtitle="Ürün reçetelerini ve üretim operasyonlarını yönetin."
        action={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" />Yeni BOM</Button>} />

      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        onRowClick={(r) => router.push(`/dashboard/production/boms/${r.id}`)}
        emptyTitle="BOM bulunamadı" emptyDescription="Yeni bir ürün ağacı oluşturarak başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Yeni BOM" size="sm"
        footer={<><Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
          <Button size="sm" loading={create.isPending} disabled={!form.productId.trim() || !form.name.trim()}
            onClick={() => create.mutate({ productId: form.productId, name: form.name, version: form.version || '1.0' },
              { onSuccess: () => { setCreateOpen(false); setForm({ productId: '', name: '', version: '1.0' }); } })}>Oluştur</Button></>}>
        <div className="space-y-4">
          <Input label="Ürün ID" required placeholder="Üretilecek ürünün ID'si" value={form.productId} onChange={(e) => setForm((p) => ({ ...p, productId: e.target.value }))} />
          <Input label="BOM Adı" required placeholder="ör. Laptop Pro Reçetesi" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <Input label="Versiyon" placeholder="1.0" value={form.version} onChange={(e) => setForm((p) => ({ ...p, version: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
