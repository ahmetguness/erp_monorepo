'use client';

import { useState } from 'react';
import { Send, PackageCheck, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { PurchaseOrderStatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { AttachmentPanel } from '@/components/shared/AttachmentPanel';
import { EntityActivityTimeline } from '@/components/shared/EntityActivityTimeline';
import { EntityTaskActions } from '@/components/shared/EntityTaskActions';
import { usePurchaseOrder, useSendPurchaseOrder, useReceivePurchaseOrder, useCancelPurchaseOrder } from '@/hooks/usePurchase';
import { useWarehouses } from '@/hooks/useStock';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { PurchaseOrderItem } from '@/services/purchase.service';

interface ReceiveLineState {
  itemId: string;
  productName: string;
  quantity: number;
  received: number;
  receivedQty: number;
}

interface Props { id: string }

export function PurchaseOrderDetailPage({ id }: Props) {
  const { data: order, isLoading } = usePurchaseOrder(id);
  const sendOrder = useSendPurchaseOrder();
  const receiveOrder = useReceivePurchaseOrder();
  const cancelOrder = useCancelPurchaseOrder();
  const { data: warehouses = [] } = useWarehouses();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [receiveLines, setReceiveLines] = useState<ReceiveLineState[]>([]);

  const openReceiveModal = () => {
    if (!order?.items) return;
    setReceiveLines(
      order.items.map((item) => ({
        itemId: item.id,
        productName: item.product?.name ?? item.description ?? '—',
        quantity: item.quantity,
        received: item.received,
        receivedQty: item.quantity - item.received,
      })),
    );
    setSelectedWarehouse(warehouses[0]?.id ?? '');
    setReceiveOpen(true);
  };

  const handleReceive = () => {
    if (!selectedWarehouse) return;
    receiveOrder.mutate(
      {
        id,
        data: {
          warehouseId: selectedWarehouse,
          items: receiveLines
            .filter((l) => l.receivedQty > 0)
            .map((l) => ({ itemId: l.itemId, receivedQty: l.receivedQty })),
        },
      },
      { onSuccess: () => setReceiveOpen(false) },
    );
  };

  const updateReceiveQty = (itemId: string, qty: number) => {
    setReceiveLines((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, receivedQty: Math.max(0, Math.min(qty, l.quantity - l.received)) } : l)),
    );
  };

  const lineColumns: ColumnDef<PurchaseOrderItem>[] = [
    {
      key: 'product', header: 'Ürün / Açıklama',
      render: (r) => (
        <div>
          <p className="text-slate-200">{r.product?.name ?? r.description ?? '—'}</p>
          {r.product && r.description && <p className="text-xs text-slate-500">{r.description}</p>}
        </div>
      ),
    },
    { key: 'quantity', header: 'Miktar', width: '90px', align: 'right', render: (r) => <span className="text-slate-300">{r.quantity}</span> },
    { key: 'received', header: 'Teslim', width: '90px', align: 'right', render: (r) => <span className="text-slate-300">{r.received}</span> },
    { key: 'unitPrice', header: 'Birim Fiyat', width: '120px', align: 'right', render: (r) => <span className="text-slate-300">{formatCurrency(r.unitPrice)}</span> },
    { key: 'discount', header: 'İskonto', width: '80px', align: 'right', render: (r) => <span className="text-slate-400">%{r.discount}</span> },
    { key: 'taxRate', header: 'KDV', width: '70px', align: 'right', render: (r) => <span className="text-slate-400">%{r.taxRate}</span> },
    { key: 'lineTotal', header: 'Toplam', width: '120px', align: 'right', render: (r) => <span className="font-medium text-slate-200">{formatCurrency(r.lineTotal)}</span> },
  ];

  if (isLoading) return <FullPageSpinner />;
  if (!order) return <div className="text-slate-400 text-sm">Satın alma siparişi bulunamadı.</div>;

  const isDraft = order.status === 'DRAFT';
  const canReceive = order.status === 'SENT' || order.status === 'PARTIALLY_RECEIVED';
  const canCancel = order.status !== 'CANCELLED' && order.status !== 'RECEIVED';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Satın Alma ${order.number}`}
        subtitle={order.contact?.name}
        action={
          <div className="flex items-center gap-2">
            {isDraft && (
              <Button leftIcon={<Send className="w-4 h-4" />} onClick={() => setSendOpen(true)}>
                Gönder
              </Button>
            )}
            {canReceive && (
              <Button variant="secondary" leftIcon={<PackageCheck className="w-4 h-4" />} onClick={openReceiveModal}>
                Teslim Al
              </Button>
            )}
            {canCancel && (
              <Button variant="danger" leftIcon={<XCircle className="w-4 h-4" />} onClick={() => setCancelOpen(true)}>
                İptal Et
              </Button>
            )}
          </div>
        }
      />

      {/* Details Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <PurchaseOrderStatusBadge status={order.status} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><p className="text-slate-500 text-xs">Tarih</p><p className="text-slate-200">{formatDate(order.date)}</p></div>
          <div><p className="text-slate-500 text-xs">Vade</p><p className="text-slate-200">{order.dueDate ? formatDate(order.dueDate) : '—'}</p></div>
          <div><p className="text-slate-500 text-xs">Net Tutar</p><p className="text-slate-200">{formatCurrency(order.totalNet)}</p></div>
          <div><p className="text-slate-500 text-xs">KDV</p><p className="text-slate-200">{formatCurrency(order.totalTax)}</p></div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-800 flex justify-end">
          <div className="text-right">
            <p className="text-slate-500 text-xs">Genel Toplam</p>
            <p className="text-white font-bold text-xl">{formatCurrency(order.totalGross)}</p>
          </div>
        </div>
        {order.notes && <p className="text-sm text-slate-400 pt-3 mt-3 border-t border-slate-800">{order.notes}</p>}
      </div>

      {/* Items Table */}
      <DataTable
        columns={lineColumns}
        data={(order.items ?? []) as PurchaseOrderItem[]}
        keyExtractor={(r) => r.id}
        emptyTitle="Kalem bulunamadı"
      />

      {/* Attachments */}
      <AttachmentPanel entityType="PURCHASE_ORDER" entityId={id} />
      <EntityTaskActions entityType="PURCHASE_ORDER" entityId={id} entityLabel={`Satın Alma ${order.number}`} module="purchasing" />
      <EntityActivityTimeline entityType="PURCHASE_ORDER" entityId={id} />

      {/* Send Confirm */}
      <ConfirmDialog
        isOpen={sendOpen}
        onClose={() => setSendOpen(false)}
        onConfirm={() => sendOrder.mutate(id, { onSuccess: () => setSendOpen(false) })}
        title="Siparişi Gönder"
        message={`"${order.number}" siparişini tedarikçiye göndermek istediğinize emin misiniz?`}
        confirmLabel="Gönder"
        isLoading={sendOrder.isPending}
        variant="warning"
      />

      {/* Cancel Confirm */}
      <ConfirmDialog
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelOrder.mutate(id, { onSuccess: () => setCancelOpen(false) })}
        message={`"${order.number}" siparişini iptal etmek istediğinize emin misiniz?`}
        isLoading={cancelOrder.isPending}
      />

      {/* Receive Modal */}
      <Modal
        isOpen={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        title="Teslim Al"
        description="Teslim alınacak miktarları ve depoyu seçin."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReceiveOpen(false)} disabled={receiveOrder.isPending}>İptal</Button>
            <Button onClick={handleReceive} loading={receiveOrder.isPending} disabled={!selectedWarehouse}>Teslim Al</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Depo</label>
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="w-full h-9 px-3 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">Depo seçin</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            {receiveLines.map((line) => (
              <div key={line.itemId} className="flex items-center gap-3 bg-slate-800/50 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{line.productName}</p>
                  <p className="text-xs text-slate-500">Sipariş: {line.quantity} · Teslim edilen: {line.received}</p>
                </div>
                <input
                  type="number"
                  min={0}
                  max={line.quantity - line.received}
                  value={line.receivedQty}
                  onChange={(e) => updateReceiveQty(line.itemId, Number(e.target.value))}
                  className="w-20 h-8 px-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-200 text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
