'use client';

import { useState } from 'react';
import { FileSearch, Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { ProductBatchSelect, ProductSelect } from '@/components/shared/EntitySelect';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useCreateLotSerial, useLotSerialTraceability, useLotSerials } from '@/hooks/useLotSerials';
import { formatDate } from '@/lib/utils';
import type { LotSerial, TraceabilityReportItem } from '@/services/lot-serial.service';

const SOURCE_LABELS: Record<TraceabilityReportItem['sourceType'], string> = {
  LOT_SERIAL: 'Lot/Seri',
  PRODUCT_BATCH: 'Parti',
  STOCK_MOVEMENT: 'Stok Hareketi',
  DELIVERY_NOTE: 'İrsaliye',
  SALES_ORDER: 'Satış Siparişi',
  PURCHASE_ORDER: 'Satın Alma Siparişi',
  INVOICE: 'Fatura',
  WORK_ORDER: 'İş Emri',
  SERVICE_REQUEST: 'Servis',
  OTHER: 'Diğer',
};

const DIRECTION_MAP: Record<TraceabilityReportItem['direction'], { label: string; variant: 'success' | 'danger' | 'neutral' }> = {
  IN: { label: 'Giriş', variant: 'success' },
  OUT: { label: 'Çıkış', variant: 'danger' },
  NEUTRAL: { label: 'Kayıt', variant: 'neutral' },
};

function formatQty(value: number | null): string {
  if (value === null) return '-';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(value);
}

export function LotSerialsPage() {
  const [page, setPage] = useState(1);
  const [usedFilter, setUsedFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ productId: '', batchId: '', serialNumber: '' });
  const [traceFilters, setTraceFilters] = useState({ productId: '', batchId: '', lotId: '' });

  const { data, isLoading } = useLotSerials({ page, limit: 20, isUsed: usedFilter || undefined });
  const traceability = useLotSerialTraceability({
    productId: traceFilters.productId || undefined,
    batchId: traceFilters.batchId || undefined,
    lotId: traceFilters.lotId || undefined,
  });
  const report = traceability.data;
  const createLot = useCreateLotSerial();

  const columns: ColumnDef<LotSerial>[] = [
    { key: 'serialNumber', header: 'Seri No', width: '150px', render: (r) => <span className="font-mono text-sky-400">{r.serialNumber}</span> },
    { key: 'product', header: 'Ürün', render: (r) => (
      <div>
        <span className="text-white text-sm">{r.product?.name ?? '-'}</span>
        {r.product?.code && <span className="text-slate-500 text-xs ml-2">{r.product.code}</span>}
      </div>
    )},
    { key: 'batch', header: 'Parti', width: '120px', render: (r) => <span className="text-slate-400 text-xs">{r.batch?.batchNumber ?? '-'}</span> },
    { key: 'isUsed', header: 'Durum', width: '110px',
      render: (r) => r.isUsed ? <Badge variant="neutral">Kullanıldı</Badge> : <Badge variant="success">Müsait</Badge> },
    { key: 'usedAt', header: 'Kullanım Tarihi', width: '120px', render: (r) => <span className="text-slate-400 text-xs">{r.usedAt ? formatDate(r.usedAt) : '-'}</span> },
    {
      key: 'trace',
      header: '',
      width: '90px',
      align: 'right',
      render: (r) => (
        <button
          type="button"
          onClick={() => setTraceFilters({ productId: r.productId, batchId: r.batchId ?? '', lotId: r.id })}
          className="inline-flex items-center gap-1 rounded-lg border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-300 hover:bg-sky-500/20"
        >
          <FileSearch className="h-3 w-3" />
          İz
        </button>
      ),
    },
    { key: 'createdAt', header: 'Oluşturma', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.createdAt)}</span> },
  ];

  const traceColumns: ColumnDef<TraceabilityReportItem>[] = [
    {
      key: 'sourceType',
      header: 'Kaynak',
      width: '150px',
      render: (row) => <Badge variant={row.sourceType === 'INVOICE' ? 'success' : row.sourceType === 'SERVICE_REQUEST' ? 'purple' : 'info'}>{SOURCE_LABELS[row.sourceType]}</Badge>,
    },
    {
      key: 'sourceLabel',
      header: 'Kayıt',
      render: (row) => (
        <div>
          <p className="text-sm font-medium text-white">{row.sourceLabel}</p>
          {row.detail && <p className="text-xs text-slate-500">{row.detail}</p>}
        </div>
      ),
    },
    { key: 'productName', header: 'Ürün', width: '190px', render: (row) => <span className="text-slate-300 text-xs">{row.productCode ? `${row.productCode} - ` : ''}{row.productName}</span> },
    { key: 'serialNumber', header: 'Seri/Parti', width: '160px', render: (row) => <span className="text-slate-400 text-xs">{row.serialNumber ?? row.batchNumber ?? '-'}</span> },
    { key: 'quantity', header: 'Miktar', width: '80px', align: 'right', render: (row) => <span className="text-white tabular-nums">{formatQty(row.quantity)}</span> },
    { key: 'direction', header: 'Yön', width: '90px', render: (row) => {
      const direction = DIRECTION_MAP[row.direction];
      return <Badge variant={direction.variant}>{direction.label}</Badge>;
    } },
    { key: 'date', header: 'Tarih', width: '110px', render: (row) => <span className="text-slate-400 text-xs">{row.date ? formatDate(row.date) : '-'}</span> },
  ];

  const selectedFilters = Boolean(traceFilters.productId || traceFilters.batchId || traceFilters.lotId);

  return (
    <div>
      <PageHeader
        title="Lot / Seri Numaraları"
        subtitle="Ürün lot ve seri numaralarını takip edin."
        action={
          <button
            onClick={() => setCreateOpen(true)}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 transition-all duration-200 active:scale-[0.97]"
          >
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15"><Plus className="w-3.5 h-3.5" /></span>
            Yeni Seri No
          </button>
        }
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <ProductSelect label="İzlenecek Ürün" value={traceFilters.productId} onChange={(value) => setTraceFilters((p) => ({ ...p, productId: value, batchId: '', lotId: '' }))} />
        <ProductBatchSelect label="İzlenecek Parti" value={traceFilters.batchId} productId={traceFilters.productId || undefined} onChange={(value) => setTraceFilters((p) => ({ ...p, batchId: value, lotId: '' }))} />
        <Input label="Lot/Seri ID" value={traceFilters.lotId} onChange={(e) => setTraceFilters((p) => ({ ...p, lotId: e.target.value }))} />
        <div className="flex items-end">
          <Button variant="outline" className="w-full" onClick={() => setTraceFilters({ productId: '', batchId: '', lotId: '' })}>
            Temizle
          </Button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-5">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-500">Lot/Seri</p>
          <p className="mt-1 text-xl font-bold text-white">{report?.summary.lotCount ?? 0}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-500">Parti</p>
          <p className="mt-1 text-xl font-bold text-white">{report?.summary.batchCount ?? 0}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-500">Stok/İrsaliye</p>
          <p className="mt-1 text-xl font-bold text-white">{(report?.summary.movementCount ?? 0) + (report?.summary.deliveryCount ?? 0)}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-500">Fatura</p>
          <p className="mt-1 text-xl font-bold text-white">{report?.summary.invoiceCount ?? 0}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-500">Servis</p>
          <p className="mt-1 text-xl font-bold text-white">{report?.summary.serviceCount ?? 0}</p>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-white">İzlenebilirlik Raporu</h2>
        <DataTable
          columns={traceColumns}
          data={selectedFilters ? report?.items ?? [] : []}
          keyExtractor={(row) => row.id}
          isLoading={traceability.isLoading}
          emptyTitle={selectedFilters ? 'İz kaydı bulunamadı' : 'İzleme filtresi seçin'}
          emptyDescription={selectedFilters ? 'Seçilen ürün, parti veya lot için geriye dönük kullanım kaydı bulunamadı.' : 'Ürün, parti veya satırdaki İz butonu ile raporu görüntüleyin.'}
        />
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setUsedFilter('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!usedFilter ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'text-slate-400 hover:text-white'}`}>Tümü</button>
        <button onClick={() => setUsedFilter('false')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${usedFilter === 'false' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-white'}`}>Müsait</button>
        <button onClick={() => setUsedFilter('true')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${usedFilter === 'true' ? 'bg-slate-500/20 text-slate-300 border border-slate-500/30' : 'text-slate-400 hover:text-white'}`}>Kullanıldı</button>
      </div>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Lot/Seri numarası bulunamadı"
        emptyDescription="Yeni bir seri numarası ekleyerek başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni Lot / Seri Numarası"
        size="sm"
        footer={(
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
            <Button size="sm" loading={createLot.isPending} disabled={!form.productId || !form.serialNumber} onClick={() => {
              createLot.mutate({
                productId: form.productId,
                serialNumber: form.serialNumber,
                batchId: form.batchId || undefined,
              }, { onSuccess: () => setCreateOpen(false) });
            }}>Oluştur</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <ProductSelect label="Ürün" required value={form.productId} onChange={(value) => setForm((p) => ({ ...p, productId: value, batchId: '' }))} />
          <Input label="Seri Numarası" required value={form.serialNumber} onChange={(e) => setForm((p) => ({ ...p, serialNumber: e.target.value }))} />
          <ProductBatchSelect label="Parti" value={form.batchId} productId={form.productId || undefined} onChange={(value) => setForm((p) => ({ ...p, batchId: value }))} />
        </div>
      </Modal>
    </div>
  );
}
