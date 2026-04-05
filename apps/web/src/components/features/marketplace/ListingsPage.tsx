'use client';

import { useState } from 'react';
import { Plus, ShoppingBag, Trash2, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { FormRow } from '@/components/shared/FormField';
import { useListings, useCreateListing, useUpdateListing, useDeleteListing } from '@/hooks/useMarketplace';
import { formatCurrency } from '@/lib/utils';
import type { MarketplaceListing } from '@/services/marketplace.service';

export function ListingsPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MarketplaceListing | null>(null);
  const [form, setForm] = useState({ integrationId: '', productId: '', externalId: '', externalSku: '', price: '', stock: '' });
  const [editForm, setEditForm] = useState({ price: '', stock: '' });

  const { data, isLoading } = useListings({ page, limit: 20 });
  const create = useCreateListing();
  const update = useUpdateListing();
  const remove = useDeleteListing();

  const columns: ColumnDef<MarketplaceListing>[] = [
    {
      key: 'product', header: 'Ürün',
      render: (r) => (
        <div>
          <span className="text-white text-sm font-medium">{r.product?.name ?? '—'}</span>
          <span className="block text-xs text-slate-500 font-mono">{r.product?.code}</span>
        </div>
      ),
    },
    {
      key: 'channel', header: 'Kanal', width: '120px',
      render: (r) => <Badge variant="info">{r.integration?.channel ?? '—'}</Badge>,
    },
    {
      key: 'externalId', header: 'Dış ID', width: '130px',
      render: (r) => <code className="text-xs text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded">{r.externalId}</code>,
    },
    {
      key: 'price', header: 'Fiyat', width: '110px', align: 'right',
      render: (r) => <span className="text-white font-medium tabular-nums">{formatCurrency(r.price)}</span>,
    },
    {
      key: 'stock', header: 'Stok', width: '80px', align: 'center',
      render: (r) => <span className={`font-medium ${Number(r.stock) <= 0 ? 'text-red-400' : 'text-slate-300'}`}>{r.stock}</span>,
    },
    {
      key: 'isActive', header: 'Durum', width: '80px',
      render: (r) => r.isActive ? <Badge variant="success">Aktif</Badge> : <Badge variant="neutral">Pasif</Badge>,
    },
    {
      key: 'actions', header: '', width: '80px', align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={(e) => { e.stopPropagation(); setEditTarget(r); setEditForm({ price: String(r.price), stock: String(r.stock) }); }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={(e) => { e.stopPropagation(); remove.mutate(r.id); }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Ürün Listelemeleri" subtitle="Pazaryerlerindeki ürün fiyat ve stok bilgilerini yönetin."
        action={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" />Yeni Listeleme</Button>} />

      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        emptyTitle="Listeleme bulunamadı" emptyDescription="Bir ürünü pazaryerine listeleyerek başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Yeni Listeleme" size="sm"
        footer={<><Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
          <Button size="sm" loading={create.isPending} disabled={!form.integrationId || !form.productId || !form.externalId || !form.price}
            onClick={() => create.mutate({ integrationId: form.integrationId, productId: form.productId, externalId: form.externalId, externalSku: form.externalSku || undefined, price: Number(form.price), stock: form.stock ? Number(form.stock) : undefined },
              { onSuccess: () => { setCreateOpen(false); setForm({ integrationId: '', productId: '', externalId: '', externalSku: '', price: '', stock: '' }); } })}>Oluştur</Button></>}>
        <div className="space-y-4">
          <Input label="Entegrasyon ID" required placeholder="Pazaryeri entegrasyon ID'si" value={form.integrationId} onChange={(e) => setForm((p) => ({ ...p, integrationId: e.target.value }))} />
          <Input label="Ürün ID" required placeholder="Yerel ürün ID'si" value={form.productId} onChange={(e) => setForm((p) => ({ ...p, productId: e.target.value }))} />
          <Input label="Dış Ürün ID" required placeholder="Pazaryerindeki ürün ID'si" value={form.externalId} onChange={(e) => setForm((p) => ({ ...p, externalId: e.target.value }))} />
          <FormRow cols={2}>
            <Input label="Fiyat" required type="number" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} />
            <Input label="Stok" type="number" value={form.stock} onChange={(e) => setForm((p) => ({ ...p, stock: e.target.value }))} />
          </FormRow>
        </div>
      </Modal>

      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title="Fiyat / Stok Güncelle" size="sm"
        footer={<><Button variant="ghost" size="sm" onClick={() => setEditTarget(null)}>İptal</Button>
          <Button size="sm" onClick={() => { if (!editTarget) return; update.mutate({ id: editTarget.id, data: { price: Number(editForm.price), stock: Number(editForm.stock) } }, { onSuccess: () => setEditTarget(null) }); }}>Kaydet</Button></>}>
        <div className="space-y-4">
          <Input label="Fiyat" type="number" value={editForm.price} onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))} />
          <Input label="Stok" type="number" value={editForm.stock} onChange={(e) => setEditForm((p) => ({ ...p, stock: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
