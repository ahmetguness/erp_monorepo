'use client';

import { useState } from 'react';
import { Plus, Hash } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useLotSerials, useCreateLotSerial } from '@/hooks/useLotSerials';
import { formatDate } from '@/lib/utils';
import type { LotSerial } from '@/services/lot-serial.service';

export function LotSerialsPage() {
  const [page, setPage] = useState(1);
  const [usedFilter, setUsedFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ productId: '', batchId: '', serialNumber: '' });

  const { data, isLoading } = useLotSerials({ page, limit: 20, isUsed: usedFilter || undefined });
  const createLot = useCreateLotSerial();

  const columns: ColumnDef<LotSerial>[] = [
    { key: 'serialNumber', header: 'Seri No', width: '150px', render: (r) => <span className="font-mono text-sky-400">{r.serialNumber}</span> },
    { key: 'product', header: 'Ürün', render: (r) => (
      <div>
        <span className="text-white text-sm">{r.product?.name ?? '—'}</span>
        {r.product?.code && <span className="text-slate-500 text-xs ml-2">{r.product.code}</span>}
      </div>
    )},
    { key: 'batch', header: 'Parti', width: '120px', render: (r) => <span className="text-slate-400 text-xs">{r.batch?.batchNumber ?? '—'}</span> },
    { key: 'isUsed', header: 'Durum', width: '110px',
      render: (r) => r.isUsed ? <Badge variant="neutral">Kullanıldı</Badge> : <Badge variant="success">Müsait</Badge> },
    { key: 'usedAt', header: 'Kullanım Tarihi', width: '120px', render: (r) => <span className="text-slate-400 text-xs">{r.usedAt ? formatDate(r.usedAt) : '—'}</span> },
    { key: 'createdAt', header: 'Oluşturma', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Lot / Seri Numaraları" subtitle="Ürün lot ve seri numaralarını takip edin."
        action={
          <button onClick={() => setCreateOpen(true)}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 transition-all duration-200 active:scale-[0.97]">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15"><Plus className="w-3.5 h-3.5" /></span>
            Yeni Seri No
          </button>
        }
      />
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setUsedFilter('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!usedFilter ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'text-slate-400 hover:text-white'}`}>Tümü</button>
        <button onClick={() => setUsedFilter('false')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${usedFilter === 'false' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-white'}`}>Müsait</button>
        <button onClick={() => setUsedFilter('true')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${usedFilter === 'true' ? 'bg-slate-500/20 text-slate-300 border border-slate-500/30' : 'text-slate-400 hover:text-white'}`}>Kullanıldı</button>
      </div>
      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        emptyTitle="Lot/Seri numarası bulunamadı" emptyDescription="Yeni bir seri numarası ekleyerek başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Yeni Lot / Seri Numarası" size="sm"
        footer={<>
          <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
          <Button size="sm" loading={createLot.isPending} onClick={() => {
            createLot.mutate({
              productId: form.productId, serialNumber: form.serialNumber,
              batchId: form.batchId || undefined,
            }, { onSuccess: () => setCreateOpen(false) });
          }}>Oluştur</Button>
        </>}>
        <div className="space-y-4">
          <Input label="Ürün ID" required value={form.productId} onChange={(e) => setForm((p) => ({ ...p, productId: e.target.value }))} />
          <Input label="Seri Numarası" required value={form.serialNumber} onChange={(e) => setForm((p) => ({ ...p, serialNumber: e.target.value }))} />
          <Input label="Parti ID" placeholder="Opsiyonel" value={form.batchId} onChange={(e) => setForm((p) => ({ ...p, batchId: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
