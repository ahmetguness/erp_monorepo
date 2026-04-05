'use client';

import { useState } from 'react';
import { Eye, ShoppingCart } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useMarketplaceOrders, useMarketplaceOrder, useChangeOrderStatus } from '@/hooks/useMarketplace';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { MarketplaceOrder } from '@/services/marketplace.service';

const STATUS_MAP: Record<string, { label: string; variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  PENDING: { label: 'Bekliyor', variant: 'warning' },
  PROCESSING: { label: 'İşleniyor', variant: 'info' },
  SHIPPED: { label: 'Kargoda', variant: 'info' },
  DELIVERED: { label: 'Teslim Edildi', variant: 'success' },
  CANCELLED: { label: 'İptal', variant: 'danger' },
  RETURNED: { label: 'İade', variant: 'neutral' },
  REFUNDED: { label: 'İade Edildi', variant: 'neutral' },
};

const CHANNEL_LABELS: Record<string, string> = {
  TRENDYOL: 'Trendyol', HEPSIBURADA: 'Hepsiburada', N11: 'N11',
  AMAZON: 'Amazon', CICEKSEPETI: 'Çiçeksepeti', OTHER: 'Diğer',
};

export function MarketplaceOrdersPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<MarketplaceOrder | null>(null);
  const [newStatus, setNewStatus] = useState('');

  const { data, isLoading } = useMarketplaceOrders({ page, limit: 20, ...(statusFilter && { status: statusFilter }) });
  const { data: detail } = useMarketplaceOrder(detailId ?? '');
  const changeStatus = useChangeOrderStatus();

  const columns: ColumnDef<MarketplaceOrder>[] = [
    {
      key: 'externalId', header: 'Sipariş No', width: '140px',
      render: (r) => <code className="text-xs text-sky-400 font-mono">{r.externalId}</code>,
    },
    {
      key: 'channel', header: 'Kanal', width: '120px',
      render: (r) => <Badge variant="info">{CHANNEL_LABELS[r.channel] ?? r.channel}</Badge>,
    },
    {
      key: 'customer', header: 'Müşteri',
      render: (r) => (
        <div>
          <span className="text-white text-sm">{r.customerName ?? '—'}</span>
          {r.customerPhone && <span className="block text-xs text-slate-500">{r.customerPhone}</span>}
        </div>
      ),
    },
    {
      key: 'totalAmount', header: 'Tutar', width: '120px', align: 'right',
      render: (r) => <span className="text-white font-medium tabular-nums">{formatCurrency(r.totalAmount)}</span>,
    },
    {
      key: 'status', header: 'Durum', width: '130px',
      render: (r) => { const s = STATUS_MAP[r.status]; return s ? <Badge variant={s.variant}>{s.label}</Badge> : <span>{r.status}</span>; },
    },
    {
      key: 'orderDate', header: 'Tarih', width: '100px',
      render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.orderDate)}</span>,
    },
    {
      key: 'actions', header: '', width: '50px', align: 'right',
      render: (r) => (
        <button onClick={(e) => { e.stopPropagation(); setDetailId(r.id); }}
          className="p-1.5 rounded-lg text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
      ),
    },
  ];

  const statuses = ['', 'PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED'];

  return (
    <div>
      <PageHeader title="Pazaryeri Siparişleri" subtitle="E-ticaret kanallarından gelen siparişleri takip edin." />

      <div className="flex items-center gap-1 mb-5 bg-slate-900/50 border border-slate-800/60 rounded-xl p-1 w-fit flex-wrap">
        {statuses.map((s) => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === s ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
            {s ? (STATUS_MAP[s]?.label ?? s) : 'Tümü'}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        onRowClick={(r) => setDetailId(r.id)}
        emptyTitle="Pazaryeri siparişi bulunamadı" emptyDescription="Entegrasyonlar aktif olduğunda siparişler burada görünecek."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />

      {/* Detail Modal */}
      <Modal isOpen={!!detailId} onClose={() => setDetailId(null)} title={detail ? `Sipariş ${detail.externalId}` : 'Sipariş Detayı'} size="md"
        footer={
          <div className="flex items-center gap-2 w-full">
            {detail && !['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(detail.status) && (
              <Button variant="ghost" size="sm" onClick={() => { setStatusModal(detail); setNewStatus(''); setDetailId(null); }}>Durum Değiştir</Button>
            )}
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setDetailId(null)}>Kapat</Button>
          </div>
        }>
        {detail ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Kanal', value: CHANNEL_LABELS[detail.channel] ?? detail.channel },
                { label: 'Durum', value: STATUS_MAP[detail.status]?.label ?? detail.status },
                { label: 'Müşteri', value: detail.customerName ?? '—' },
                { label: 'Tutar', value: formatCurrency(detail.totalAmount) },
              ].map((item) => (
                <div key={item.label} className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                  <div className="text-[10px] text-slate-500 mb-1">{item.label}</div>
                  <div className="text-sm text-white">{item.value}</div>
                </div>
              ))}
            </div>
            {detail.shippingAddress && (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                <div className="text-[10px] text-slate-500 mb-1">Teslimat Adresi</div>
                <div className="text-sm text-slate-300">{detail.shippingAddress}</div>
              </div>
            )}
            {detail.items && detail.items.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-slate-400 mb-3">Kalemler</h4>
                <div className="space-y-2">
                  {detail.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between bg-slate-800/30 border border-slate-700/40 rounded-xl px-4 py-3">
                      <div>
                        <span className="text-sm text-white">{item.name}</span>
                        {item.product && <span className="block text-xs text-slate-500 font-mono">{item.product.code}</span>}
                      </div>
                      <div className="text-right">
                        <span className="text-sm text-white">{item.quantity} × {formatCurrency(item.unitPrice)}</span>
                        <span className="block text-xs text-slate-400">{formatCurrency(item.lineTotal)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </Modal>

      {/* Status Change Modal */}
      <Modal isOpen={!!statusModal} onClose={() => setStatusModal(null)} title="Sipariş Durumu Değiştir" size="sm"
        footer={<><Button variant="ghost" size="sm" onClick={() => setStatusModal(null)}>İptal</Button>
          <Button size="sm" loading={changeStatus.isPending} disabled={!newStatus}
            onClick={() => { if (!statusModal) return; changeStatus.mutate({ id: statusModal.id, data: { status: newStatus } }, { onSuccess: () => setStatusModal(null) }); }}>Güncelle</Button></>}>
        <Select label="Yeni Durum" required
          options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
          value={newStatus} onChange={(e) => setNewStatus(e.target.value)} />
      </Modal>
    </div>
  );
}
