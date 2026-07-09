'use client';

import { useState } from 'react';
import { CheckCircle2, CircleDashed, FileText, PackageCheck, Send, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { PurchaseOrderStatusBadge } from '@/components/shared/StatusBadge';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { EntityActionPanel } from '@/components/shared/EntityActionPanel';
import { usePurchaseOrder, useSendPurchaseOrder, useReceivePurchaseOrder, useCancelPurchaseOrder } from '@/hooks/usePurchase';
import { useWarehouses } from '@/hooks/useStock';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { PurchaseOrderItem, PurchaseTraceStage } from '@/services/purchase.service';
import type { RecommendedEntityAction } from '@/components/shared/RecommendedActionsPanel';

interface ReceiveLineState {
  itemId: string;
  productName: string;
  quantity: number;
  received: number;
  receivedQty: number;
}

interface Props { id: string }

function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function traceStageVariant(status: PurchaseTraceStage['status']): BadgeVariant {
  if (status === 'complete') return 'success';
  if (status === 'partial') return 'warning';
  if (status === 'cancelled') return 'danger';
  return 'neutral';
}

function traceStageLabel(status: PurchaseTraceStage['status']): string {
  if (status === 'complete') return 'Tamam';
  if (status === 'partial') return 'Kismi';
  if (status === 'cancelled') return 'Iptal';
  if (status === 'pending') return 'Bekliyor';
  return 'Eksik';
}

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
  const openItems = (order.items ?? []).filter((item) => Number(item.quantity) > Number(item.received));
  const recommendedActions: RecommendedEntityAction[] = canReceive && openItems.length > 0
    ? [{
        id: `purchase-order-${id}-receive-followup`,
        kind: 'task',
        title: 'Teslim alma takip görevi oluştur',
        summary: `${openItems.length} kalemde teslim alınmamış miktar var. Depo teslim süreci takip edilmeli.`,
        priority: 'MEDIUM',
        entityType: 'PURCHASE_ORDER',
        entityId: id,
        module: 'purchasing',
        href: `/dashboard/purchase-orders/${id}`,
        steps: ['Öneriyi gör', 'Görev taslağını incele', 'Onayla', 'Workflow’da takip et'],
        draft: {
          title: `${order.number} teslim alma takibi`,
          detail: [
            `Satın alma: ${order.number}`,
            `Tedarikçi: ${order.contact?.name ?? '-'}`,
            ...openItems.map((item) => `- ${item.product?.name ?? item.description ?? 'Kalem'}: kalan ${Number(item.quantity) - Number(item.received)}`),
          ].join('\n'),
          type: 'CHECK',
          dueAt: addDays(1),
        },
      }]
    : [];

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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-6">
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

      {order.trace && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Uctan uca satin alma izi</h2>
              <p className="mt-1 text-xs text-slate-500">Talep, siparis, irsaliye ve fatura baglantilari.</p>
            </div>
            <Badge variant="info">{order.trace.summary.invoiceCount} fatura</Badge>
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            {order.trace.stages.map((stage) => (
              <div key={stage.key} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-300">{stage.label}</span>
                  {stage.status === 'complete' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <CircleDashed className="h-4 w-4 text-slate-500" />
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Badge variant={traceStageVariant(stage.status)}>{traceStageLabel(stage.status)}</Badge>
                  <span className="text-xs text-slate-500">{stage.count} kayit</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Talepler</p>
              <div className="mt-2 space-y-2">
                {order.trace.requests.length > 0 ? order.trace.requests.map((request) => (
                  <div key={request.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-300">{request.number}</span>
                    <Badge variant="neutral">{request.status}</Badge>
                  </div>
                )) : <p className="text-xs text-slate-600">Bagli talep yok.</p>}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Irsaliyeler</p>
              <div className="mt-2 space-y-2">
                {order.trace.deliveryNotes.length > 0 ? order.trace.deliveryNotes.map((note) => (
                  <div key={note.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-300">{note.number}</span>
                    <Badge variant="neutral">{note.status}</Badge>
                  </div>
                )) : <p className="text-xs text-slate-600">Bagli irsaliye yok.</p>}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Faturalar</p>
              <div className="mt-2 space-y-2">
                {order.trace.invoices.length > 0 ? order.trace.invoices.map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-slate-300">
                      <FileText className="h-3.5 w-3.5 text-sky-400" />
                      {invoice.number}
                    </span>
                    <span className="text-slate-400">{formatCurrency(invoice.totalGross)}</span>
                  </div>
                )) : <p className="text-xs text-slate-600">Bagli fatura yok.</p>}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-xs text-slate-500">Teslim miktari</p>
              <p className="mt-1 text-sm font-semibold text-slate-200">
                {order.trace.summary.deliveredQuantity} / {order.trace.summary.orderedQuantity}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-xs text-slate-500">Faturalanan tutar</p>
              <p className="mt-1 text-sm font-semibold text-slate-200">
                {formatCurrency(order.trace.summary.invoicedAmount)} / {formatCurrency(order.trace.summary.orderedAmount)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Items Table */}
      <DataTable
        columns={lineColumns}
        data={(order.items ?? []) as PurchaseOrderItem[]}
        keyExtractor={(r) => r.id}
        emptyTitle="Kalem bulunamadı"
      />

        </main>

      <EntityActionPanel
        entityType="PURCHASE_ORDER"
        entityId={id}
        displayName={`Satın Alma ${order.number}`}
        module="purchasing"
        primaryEmail={order.contact?.email}
        recommendedActions={recommendedActions}
      />
      </div>

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
