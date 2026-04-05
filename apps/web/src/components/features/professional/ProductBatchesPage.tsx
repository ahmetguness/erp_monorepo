'use client';

import { useState } from 'react';
import { Plus, Boxes } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useProductBatches, useCreateProductBatch } from '@/hooks/useProductBatches';
import { formatDate } from '@/lib/utils';
import type { ProductBatch } from '@/services/product-batch.service';

export function ProductBatchesPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ productId: '', batchNumber: '', expiryDate: '', manufacturedAt: '', quantity: '', notes: '' });

  const { data, isLoading } = useProductBatches({ page, limit: 20 });
  const createBatch = useCreateProductBatch();

  const columns: ColumnDef<ProductBatch>[] = [
    { key: 'batchNumber', header: 'Parti No', width: '130px', render: (r) => <span className="font-mono text-sky-400">{r.batchNumber}</span> },
    { key: 'product', header: 'Ürün', render: (r) => (
      <div>
        <span className="text-white text-sm">{r.product?.name ?? '—'}</span>
        {r.product?.code && <span className="text-slate-500 text-xs ml-2">{r.product.code}</span>}
      </div>
    )},
    { key: 'quantity', header: 'Miktar', width: '90px', align: 'right', render: (r) => <span className="text-white tabular-nums">{r.quantity}</span> },
    { key: 'lots', header: 'Lot/Seri', width: '80px', align: 'center', render: (r) => <span className="text-slate-300">{r._count?.lots ?? 0}</span> },
    { key: 'manufacturedAt', header: 'Üretim', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{r.manufacturedAt ? formatDate(r.manufacturedAt) : '—'}</span> },
    { key: 'expiryDate', header: 'Son Kullanma', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{r.expiryDate ? formatDate(r.expiryDate) : '—'}</span> },
    { key: 'createdAt', header: 'Oluşturma', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Ürün Partileri" subtitle="Ürün parti takibini yönetin."
        action={
          <button onClick={() => setCreateOpen(true)}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 transition-all duration-200 active:scale-[0.97]">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15"><Plus className="w-3.5 h-3.5" /></span>
            Yeni Parti
          </button>
        }
      />
      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        emptyTitle="Parti bulunamadı" emptyDescription="Yeni bir ürün partisi oluşturarak başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Yeni Ürün Partisi" size="md"
        footer={<>
          <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
          <Button size="sm" loading={createBatch.isPending} onClick={() => {
            createBatch.mutate({
              productId: form.productId, batchNumber: form.batchNumber,
              expiryDate: form.expiryDate || undefined, manufacturedAt: form.manufacturedAt || undefined,
              quantity: form.quantity ? Number(form.quantity) : undefined, notes: form.notes || undefined,
            }, { onSuccess: () => setCreateOpen(false) });
          }}>Oluştur</Button>
        </>}>
        <div className="space-y-4">
          <Input label="Ürün ID" required value={form.productId} onChange={(e) => setForm((p) => ({ ...p, productId: e.target.value }))} />
          <Input label="Parti Numarası" required value={form.batchNumber} onChange={(e) => setForm((p) => ({ ...p, batchNumber: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Üretim Tarihi" type="date" value={form.manufacturedAt} onChange={(e) => setForm((p) => ({ ...p, manufacturedAt: e.target.value }))} />
            <Input label="Son Kullanma Tarihi" type="date" value={form.expiryDate} onChange={(e) => setForm((p) => ({ ...p, expiryDate: e.target.value }))} />
          </div>
          <Input label="Miktar" type="number" step="1" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
          <Input label="Notlar" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
