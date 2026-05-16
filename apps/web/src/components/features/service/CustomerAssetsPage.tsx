'use client';

import { useState } from 'react';
import { Plus, Trash2, Eye } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { AttachmentPanel } from '@/components/shared/AttachmentPanel';
import { EntityImage } from '@/components/shared/EntityImage';
import { EntityImageManager } from '@/components/shared/EntityImageManager';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { FormRow } from '@/components/shared/FormField';
import { useCustomerAssets, useCreateCustomerAsset, useUpdateCustomerAsset, useDeleteCustomerAsset } from '@/hooks/useService';
import { formatDate } from '@/lib/utils';
import type { CustomerAsset } from '@/services/service.service';

export function CustomerAssetsPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailAsset, setDetailAsset] = useState<CustomerAsset | null>(null);
  const [form, setForm] = useState({ contactId: '', name: '', brand: '', model: '', serialNo: '', purchaseDate: '', warrantyEnd: '', notes: '' });

  const { data, isLoading } = useCustomerAssets({ page, limit: 20 });
  const create = useCreateCustomerAsset();
  const update = useUpdateCustomerAsset();
  const remove = useDeleteCustomerAsset();

  const resetForm = () => setForm({ contactId: '', name: '', brand: '', model: '', serialNo: '', purchaseDate: '', warrantyEnd: '', notes: '' });

  const isWarrantyActive = (warrantyEnd: string | null) => {
    if (!warrantyEnd) return false;
    return new Date(warrantyEnd) > new Date();
  };

  const columns: ColumnDef<CustomerAsset>[] = [
    {
      key: 'name', header: 'Varlık',
      render: (r) => (
        <div className="flex items-center gap-3">
          <EntityImage entityType="CUSTOMER_ASSET" entityId={r.id} className="w-8 h-8 rounded-lg shrink-0" />
          <div>
            <span className="text-white font-medium text-sm">{r.name}</span>
            <span className="block text-xs text-slate-500">
              {[r.brand, r.model].filter(Boolean).join(' ') || '—'}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'contact', header: 'Müşteri', width: '160px',
      render: (r) => <span className="text-slate-300 text-sm">{r.contact?.name ?? '—'}</span>,
    },
    {
      key: 'serialNo', header: 'Seri No', width: '130px',
      render: (r) => r.serialNo ? <code className="text-xs text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded">{r.serialNo}</code> : <span className="text-slate-600">—</span>,
    },
    {
      key: 'warranty', header: 'Garanti', width: '120px',
      render: (r) => r.warrantyEnd
        ? isWarrantyActive(r.warrantyEnd)
          ? <Badge variant="success">{formatDate(r.warrantyEnd)}</Badge>
          : <Badge variant="danger">Süresi Dolmuş</Badge>
        : <span className="text-slate-600">—</span>,
    },
    {
      key: 'serviceCount', header: 'Servis', width: '70px', align: 'center',
      render: (r) => <span className="text-slate-400">{r._count?.serviceRequests ?? 0}</span>,
    },
    {
      key: 'actions', header: '', width: '80px', align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={(e) => { e.stopPropagation(); setDetailAsset(r); }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 transition-colors" aria-label="Detay">
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); remove.mutate(r.id); }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors" aria-label="Sil">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Müşteri Varlıkları" subtitle="Müşterilere ait cihaz ve ekipmanları takip edin."
        action={<Button size="sm" onClick={() => { setCreateOpen(true); resetForm(); }}><Plus className="w-4 h-4" />Yeni Varlık</Button>} />

      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        onRowClick={(r) => setDetailAsset(r)}
        emptyTitle="Müşteri varlığı bulunamadı" emptyDescription="Yeni bir varlık ekleyerek başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />

      {/* Create Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Yeni Müşteri Varlığı" size="md"
        footer={<><Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
          <Button size="sm" loading={create.isPending} disabled={!form.contactId.trim() || !form.name.trim()}
            onClick={() => create.mutate({
              contactId: form.contactId, name: form.name,
              brand: form.brand || undefined, model: form.model || undefined,
              serialNo: form.serialNo || undefined, notes: form.notes || undefined,
              purchaseDate: form.purchaseDate || undefined, warrantyEnd: form.warrantyEnd || undefined,
            }, { onSuccess: () => { setCreateOpen(false); resetForm(); } })}>Oluştur</Button></>}>
        <div className="space-y-4">
          <Input label="Müşteri ID" required placeholder="Müşteri cari hesap ID'si" value={form.contactId} onChange={(e) => setForm((p) => ({ ...p, contactId: e.target.value }))} />
          <Input label="Varlık Adı" required placeholder="ör. HP LaserJet Pro" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <FormRow cols={2}>
            <Input label="Marka" placeholder="ör. HP" value={form.brand} onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))} />
            <Input label="Model" placeholder="ör. LaserJet Pro M404" value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} />
          </FormRow>
          <Input label="Seri No" placeholder="ör. SN12345678" value={form.serialNo} onChange={(e) => setForm((p) => ({ ...p, serialNo: e.target.value }))} />
          <FormRow cols={2}>
            <Input label="Satın Alma Tarihi" type="date" value={form.purchaseDate} onChange={(e) => setForm((p) => ({ ...p, purchaseDate: e.target.value }))} />
            <Input label="Garanti Bitiş" type="date" value={form.warrantyEnd} onChange={(e) => setForm((p) => ({ ...p, warrantyEnd: e.target.value }))} />
          </FormRow>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal isOpen={!!detailAsset} onClose={() => setDetailAsset(null)} title={detailAsset?.name ?? 'Varlık Detayı'} size="md"
        footer={<Button variant="ghost" size="sm" onClick={() => setDetailAsset(null)}>Kapat</Button>}>
        {detailAsset && (
          <div className="space-y-5">
            <EntityImageManager
              entityType="CUSTOMER_ASSET"
              entityId={detailAsset.id}
              label="Cihaz fotoğrafı"
              description="Servis varlığı için cihaz veya ekipman fotoğrafı yükleyin."
            />
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Müşteri', value: detailAsset.contact?.name ?? '—' },
                { label: 'Marka / Model', value: [detailAsset.brand, detailAsset.model].filter(Boolean).join(' ') || '—' },
                { label: 'Seri No', value: detailAsset.serialNo ?? '—' },
                { label: 'Garanti', value: detailAsset.warrantyEnd ? (isWarrantyActive(detailAsset.warrantyEnd) ? `Aktif — ${formatDate(detailAsset.warrantyEnd)}` : 'Süresi Dolmuş') : '—' },
              ].map((item) => (
                <div key={item.label} className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                  <div className="text-[10px] text-slate-500 mb-1">{item.label}</div>
                  <div className="text-sm text-white">{item.value}</div>
                </div>
              ))}
            </div>
            <AttachmentPanel entityType="CUSTOMER_ASSET" entityId={detailAsset.id} />
          </div>
        )}
      </Modal>
    </div>
  );
}
