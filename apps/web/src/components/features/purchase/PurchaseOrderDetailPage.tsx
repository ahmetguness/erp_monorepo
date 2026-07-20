'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Ban, CheckCircle2, CircleDashed, ExternalLink, FileText,
  Mail, PackageCheck, Printer, ReceiptText, Send, Truck, XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { EntityActionPanel } from '@/components/shared/EntityActionPanel';
import { WarehouseSelect } from '@/components/shared/EntitySelect';
import { PurchaseOrderStatusBadge } from '@/components/shared/StatusBadge';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { usePurchaseOrder, useSendPurchaseOrder, useReceivePurchaseOrder, useCancelPurchaseOrder } from '@/hooks/usePurchase';
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { PurchaseOrder, PurchaseOrderItem, PurchaseTraceStage } from '@/services/purchase.service';
import type { RecommendedEntityAction } from '@/components/shared/RecommendedActionsPanel';

interface Props { id: string }

interface ReceiveLineState {
  itemId: string;
  productName: string;
  quantity: number;
  received: number;
  receivedQty: number;
}

function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function traceStageVariant(status: PurchaseTraceStage['status']): BadgeVariant {
  if (status === 'complete') return 'success';
  if (status === 'partial') return 'warning';
  if (status === 'cancelled') return 'danger';
  if (status === 'pending') return 'info';
  return 'neutral';
}

function traceStageLabel(status: PurchaseTraceStage['status']): string {
  if (status === 'complete') return 'Tamam';
  if (status === 'partial') return 'Kısmi';
  if (status === 'cancelled') return 'İptal';
  if (status === 'pending') return 'Bekliyor';
  return 'Eksik';
}

function deliveryProgress(order: PurchaseOrder): { ordered: number; received: number; remaining: number; percent: number } {
  const ordered = (order.items ?? []).reduce((sum, item) => sum + Number(item.quantity), 0);
  const received = (order.items ?? []).reduce((sum, item) => sum + Number(item.received), 0);
  const traceOrdered = order.trace?.summary.orderedQuantity ?? ordered;
  const traceReceived = order.trace?.summary.deliveredQuantity ?? received;
  const remaining = Math.max(traceOrdered - traceReceived, 0);
  const percent = traceOrdered > 0 ? Math.min(100, Math.round((traceReceived / traceOrdered) * 100)) : 0;
  return { ordered: traceOrdered, received: traceReceived, remaining, percent };
}

function invoiceProgress(order: PurchaseOrder): { ordered: number; invoiced: number; remaining: number; percent: number } {
  const ordered = order.trace?.summary.orderedAmount ?? order.totalGross;
  const invoiced = order.trace?.summary.invoicedAmount ?? 0;
  const remaining = Math.max(ordered - invoiced, 0);
  const percent = ordered > 0 ? Math.min(100, Math.round((invoiced / ordered) * 100)) : 0;
  return { ordered, invoiced, remaining, percent };
}

function dueState(order: PurchaseOrder): { label: string; variant: BadgeVariant; urgent: boolean } {
  if (order.status === 'RECEIVED') return { label: 'Tamamlandı', variant: 'success', urgent: false };
  if (order.status === 'CANCELLED') return { label: 'İptal', variant: 'neutral', urgent: false };
  if (!order.dueDate) return { label: 'Vade yok', variant: 'neutral', urgent: false };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(order.dueDate); due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: `${Math.abs(days)} gün gecikti`, variant: 'danger', urgent: true };
  if (days <= 3) return { label: days === 0 ? 'Bugün vade' : `${days} gün kaldı`, variant: 'warning', urgent: true };
  return { label: `${days} gün kaldı`, variant: 'info', urgent: false };
}

function lineFlags(item: PurchaseOrderItem): string[] {
  const flags: string[] = [];
  if (Number(item.received) < Number(item.quantity)) flags.push('Eksik teslim');
  if (Number(item.received) > Number(item.quantity)) flags.push('Fazla teslim');
  if (Number(item.unitPrice) <= 0) flags.push('Sıfır fiyat');
  if (Number(item.discount) >= 20) flags.push('Yüksek iskonto');
  if (Number(item.taxRate) >= 20) flags.push('Yüksek KDV');
  return flags;
}

function ProgressCard({ title, icon: Icon, current, total, remaining, percent, currentLabel, totalLabel }: {
  title: string;
  icon: typeof Truck;
  current: string;
  total: string;
  remaining: string;
  percent: number;
  currentLabel: string;
  totalLabel: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-slate-200">
          <Icon className="h-4 w-4 text-sky-300" />
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <Badge variant={percent >= 100 ? 'success' : percent > 0 ? 'warning' : 'neutral'}>%{percent}</Badge>
      </div>
      <div className="mt-4 h-2 rounded-full bg-slate-800">
        <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div><p className="text-xs text-slate-500">{currentLabel}</p><p className="font-medium text-slate-100">{current}</p></div>
        <div><p className="text-xs text-slate-500">{totalLabel}</p><p className="font-medium text-slate-100">{total}</p></div>
        <div><p className="text-xs text-slate-500">Kalan</p><p className="font-medium text-slate-100">{remaining}</p></div>
      </div>
    </div>
  );
}

function RiskBand({ order, due, delivery, invoice }: {
  order: PurchaseOrder;
  due: ReturnType<typeof dueState>;
  delivery: ReturnType<typeof deliveryProgress>;
  invoice: ReturnType<typeof invoiceProgress>;
}) {
  const highDraft = order.status === 'DRAFT' && order.totalGross >= 100_000;
  const partial = order.status === 'PARTIALLY_RECEIVED' || delivery.remaining > 0;
  const invoiceGap = invoice.remaining > 0 && order.status !== 'CANCELLED';
  if (!due.urgent && !highDraft && !partial && !invoiceGap) return null;

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div>
          <p className="text-sm font-semibold text-amber-100">Satın alma kontrolü gerekiyor</p>
          <p className="mt-1 text-sm text-amber-100/80">
            {due.urgent ? `${due.label}. ` : ''}
            {partial ? `${delivery.remaining} adet teslim alınmamış miktar var. ` : ''}
            {invoiceGap ? `${formatCurrency(invoice.remaining, order.currencyCode)} faturalanmamış tutar var. ` : ''}
            {highDraft ? 'Yüksek tutarlı taslak sipariş gönderim öncesi kontrol edilmeli.' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

function SupplierCard({ order }: { order: PurchaseOrder }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-sm font-semibold text-slate-200">Tedarikçi</h2>
      <div className="mt-4 space-y-3 text-sm">
        <div>
          <p className="text-xs text-slate-500">Cari</p>
          {order.contact ? (
            <Link href={`/dashboard/contacts/${order.contact.id}`} className="inline-flex items-center gap-1 font-medium text-sky-300 hover:text-sky-200">
              {order.contact.name}
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : <p className="text-slate-400">Tedarikçi yok</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><p className="text-xs text-slate-500">Kod</p><p className="text-slate-300">{order.contact?.code ?? 'Yok'}</p></div>
          <div><p className="text-xs text-slate-500">E-posta</p><p className="truncate text-slate-300">{order.contact?.email ?? 'Yok'}</p></div>
        </div>
      </div>
    </div>
  );
}

function TotalsCard({ order }: { order: PurchaseOrder }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center gap-2 text-slate-200">
        <ReceiptText className="h-4 w-4 text-sky-300" />
        <h2 className="text-sm font-semibold">Toplamlar</h2>
      </div>
      <div className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between gap-4"><span className="text-slate-500">Net tutar</span><span className="text-slate-200">{formatCurrency(order.totalNet, order.currencyCode)}</span></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">KDV</span><span className="text-slate-200">{formatCurrency(order.totalTax, order.currencyCode)}</span></div>
        <div className="border-t border-slate-800 pt-3 flex justify-between gap-4">
          <span className="text-slate-400">Genel toplam</span>
          <span className="text-xl font-bold text-white">{formatCurrency(order.totalGross, order.currencyCode)}</span>
        </div>
      </div>
    </div>
  );
}

function TraceCard({ order }: { order: PurchaseOrder }) {
  if (!order.trace) return null;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Uçtan uca satın alma izi</h2>
          <p className="mt-1 text-xs text-slate-500">Talep, sipariş, irsaliye ve fatura bağlantıları.</p>
        </div>
        <Badge variant="info">{order.trace.summary.invoiceCount} fatura</Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        {order.trace.stages.map((stage) => (
          <Link key={stage.key} href={stage.href ?? `/dashboard/purchase-orders/${order.id}`} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 transition-colors hover:border-sky-500/40">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-300">{stage.label}</span>
              {stage.status === 'complete' ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <CircleDashed className="h-4 w-4 text-slate-500" />}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <Badge variant={traceStageVariant(stage.status)}>{traceStageLabel(stage.status)}</Badge>
              <span className="text-xs text-slate-500">{stage.count} kayıt</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <TraceList title="Talepler" empty="Bağlı talep yok." items={order.trace.requests.map((request) => ({ id: request.id, number: request.number, status: request.status, href: '/dashboard/purchase-orders/requests' }))} />
        <TraceList title="İrsaliyeler" empty="Bağlı irsaliye yok." items={order.trace.deliveryNotes.map((note) => ({ id: note.id, number: note.number, status: note.status, href: `/dashboard/delivery-notes?purchaseOrderId=${order.id}` }))} />
        <TraceList title="Faturalar" empty="Bağlı fatura yok." items={order.trace.invoices.map((invoice) => ({ id: invoice.id, number: invoice.number, status: formatCurrency(invoice.totalGross), href: `/dashboard/invoices/${invoice.id}` }))} />
      </div>
    </div>
  );
}

function TraceList({ title, empty, items }: { title: string; empty: string; items: Array<{ id: string; number: string; status: string; href: string }> }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <p className="text-[11px] font-medium uppercase text-slate-500">{title}</p>
      <div className="mt-2 space-y-2">
        {items.length > 0 ? items.map((item) => (
          <Link key={item.id} href={item.href} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 text-xs hover:bg-slate-900">
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <FileText className="h-3.5 w-3.5 text-sky-400" />
              {item.number}
            </span>
            <Badge variant="neutral">{item.status}</Badge>
          </Link>
        )) : <p className="text-xs text-slate-600">{empty}</p>}
      </div>
    </div>
  );
}

export function PurchaseOrderDetailPage({ id }: Props) {
  const { data: order, isLoading } = usePurchaseOrder(id);
  const sendOrder = useSendPurchaseOrder();
  const receiveOrder = useReceivePurchaseOrder();
  const cancelOrder = useCancelPurchaseOrder();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [receiveLines, setReceiveLines] = useState<ReceiveLineState[]>([]);

  const lineColumns: ColumnDef<PurchaseOrderItem>[] = [
    {
      key: 'product',
      header: 'Ürün / Açıklama',
      render: (row) => (
        <div>
          <p className="text-slate-200">{row.product?.name ?? row.description ?? 'Ürün yok'}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {row.product && <span className="text-xs text-slate-500">{row.product.code}</span>}
            {lineFlags(row).map((flag) => <Badge key={flag} variant={flag.includes('Eksik') || flag.includes('Yüksek') ? 'warning' : 'danger'}>{flag}</Badge>)}
          </div>
        </div>
      ),
    },
    { key: 'quantity', header: 'Miktar', width: '90px', align: 'right', render: (row) => <span className="text-slate-300">{row.quantity}</span> },
    {
      key: 'received',
      header: 'Teslim',
      width: '130px',
      align: 'right',
      render: (row) => {
        const percent = Number(row.quantity) > 0 ? Math.min(100, Math.round((Number(row.received) / Number(row.quantity)) * 100)) : 0;
        return <div><span className="text-slate-300">{row.received} / {row.quantity}</span><div className="mt-1 h-1.5 rounded-full bg-slate-800"><div className="h-1.5 rounded-full bg-emerald-400" style={{ width: `${percent}%` }} /></div></div>;
      },
    },
    { key: 'unitPrice', header: 'Birim Fiyat', width: '120px', align: 'right', render: (row) => <span className="text-slate-300">{formatCurrency(row.unitPrice)}</span> },
    { key: 'discount', header: 'İskonto', width: '90px', align: 'right', render: (row) => <span className={Number(row.discount) >= 20 ? 'font-medium text-amber-300' : 'text-slate-400'}>%{row.discount}</span> },
    { key: 'taxRate', header: 'KDV', width: '80px', align: 'right', render: (row) => <span className="text-slate-400">%{row.taxRate}</span> },
    { key: 'lineTotal', header: 'Toplam', width: '130px', align: 'right', render: (row) => <span className="font-medium text-slate-200">{formatCurrency(row.lineTotal)}</span> },
  ];

  if (isLoading) return <FullPageSpinner />;
  if (!order) return <div className="text-sm text-slate-400">Satın alma siparişi bulunamadı.</div>;

  const isDraft = order.status === 'DRAFT';
  const canReceive = order.status === 'SENT' || order.status === 'PARTIALLY_RECEIVED';
  const canCancel = order.status !== 'CANCELLED' && order.status !== 'RECEIVED';
  const delivery = deliveryProgress(order);
  const invoice = invoiceProgress(order);
  const due = dueState(order);
  const receiveableLines = (order.items ?? []).filter((item) => Number(item.quantity) > Number(item.received));
  const receiveTotal = receiveLines.reduce((sum, line) => sum + line.receivedQty, 0);
  const canConfirmReceive = Boolean(selectedWarehouse) && receiveTotal > 0;

  const openReceiveModal = () => {
    setReceiveLines(
      receiveableLines.map((item) => ({
        itemId: item.id,
        productName: item.product?.name ?? item.description ?? 'Ürün',
        quantity: Number(item.quantity),
        received: Number(item.received),
        receivedQty: Number(item.quantity) - Number(item.received),
      })),
    );
    setSelectedWarehouse('');
    setReceiveOpen(true);
  };

  const fillRemaining = () => {
    setReceiveLines((lines) => lines.map((line) => ({ ...line, receivedQty: line.quantity - line.received })));
  };

  const handleReceive = () => {
    if (!canConfirmReceive) return;
    receiveOrder.mutate({
      id,
      data: {
        warehouseId: selectedWarehouse,
        items: receiveLines.filter((line) => line.receivedQty > 0).map((line) => ({ itemId: line.itemId, receivedQty: line.receivedQty })),
      },
    }, { onSuccess: () => setReceiveOpen(false) });
  };

  const updateReceiveQty = (itemId: string, qty: number) => {
    setReceiveLines((lines) => lines.map((line) => (
      line.itemId === itemId ? { ...line, receivedQty: Math.max(0, Math.min(qty, line.quantity - line.received)) } : line
    )));
  };

  const recommendedActions: RecommendedEntityAction[] = canReceive && receiveableLines.length > 0
    ? [{
        id: `purchase-order-${id}-receive-followup`,
        kind: 'task',
        title: 'Teslim alma takip görevi oluştur',
        summary: `${receiveableLines.length} kalemde teslim alınmamış miktar var. Depo teslim süreci takip edilmeli.`,
        priority: due.urgent ? 'HIGH' : 'MEDIUM',
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
            ...receiveableLines.map((item) => `- ${item.product?.name ?? item.description ?? 'Kalem'}: kalan ${Number(item.quantity) - Number(item.received)}`),
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link href="/dashboard/purchase-orders"><Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>Listeye dön</Button></Link>
            <Button variant="outline" size="sm" leftIcon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>PDF / Yazdır</Button>
            <Button variant="outline" size="sm" leftIcon={<Mail className="h-3.5 w-3.5" />} disabled={!order.contact?.email} onClick={() => { if (order.contact?.email) window.location.href = `mailto:${order.contact.email}?subject=${encodeURIComponent(`${order.number} satın alma siparişi`)}`; }}>Mail</Button>
            {isDraft && <Button size="sm" leftIcon={<Send className="h-3.5 w-3.5" />} onClick={() => setSendOpen(true)}>Gönder</Button>}
            {canReceive && <Button variant="secondary" size="sm" leftIcon={<PackageCheck className="h-3.5 w-3.5" />} onClick={openReceiveModal}>Teslim al</Button>}
            {canCancel && <Button variant="danger" size="sm" leftIcon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setCancelOpen(true)}>İptal et</Button>}
          </div>
        }
      />

      <RiskBand order={order} due={due} delivery={delivery} invoice={invoice} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <PurchaseOrderStatusBadge status={order.status} />
              <Badge variant={due.variant} dot>{due.label}</Badge>
              <Badge variant={delivery.percent >= 100 ? 'success' : delivery.percent > 0 ? 'warning' : 'neutral'}>Teslim %{delivery.percent}</Badge>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div><p className="text-xs text-slate-500">Sipariş tarihi</p><p className="text-sm font-medium text-slate-200">{formatDate(order.date)}</p></div>
              <div><p className="text-xs text-slate-500">Vade</p><p className="text-sm font-medium text-slate-200">{formatDate(order.dueDate)}</p></div>
              <div><p className="text-xs text-slate-500">Teslim kalan</p><p className="text-sm font-medium text-slate-200">{delivery.remaining}</p></div>
              <div><p className="text-xs text-slate-500">Genel toplam</p><p className="text-sm font-semibold text-white">{formatCurrency(order.totalGross, order.currencyCode)}</p></div>
            </div>
            {order.notes && <p className="mt-4 border-t border-slate-800 pt-4 text-sm text-slate-400">{order.notes}</p>}
          </div>

          <TraceCard order={order} />

          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Sipariş kalemleri</h2>
              <p className="mt-1 text-xs text-slate-500">Eksik teslim, fiyat, iskonto ve KDV riskleri satırda işaretlenir.</p>
            </div>
            <DataTable columns={lineColumns} data={(order.items ?? []) as PurchaseOrderItem[]} keyExtractor={(row) => row.id} emptyTitle="Kalem bulunamadı" density="compact" />
          </section>
        </main>

        <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <TotalsCard order={order} />
          <ProgressCard title="Teslim ilerlemesi" icon={Truck} current={String(delivery.received)} total={String(delivery.ordered)} remaining={String(delivery.remaining)} percent={delivery.percent} currentLabel="Teslim" totalLabel="Sipariş" />
          <ProgressCard title="Faturalama" icon={FileText} current={formatCurrency(invoice.invoiced, order.currencyCode)} total={formatCurrency(invoice.ordered, order.currencyCode)} remaining={formatCurrency(invoice.remaining, order.currencyCode)} percent={invoice.percent} currentLabel="Faturalanan" totalLabel="Sipariş" />
          <SupplierCard order={order} />
          <EntityActionPanel entityType="PURCHASE_ORDER" entityId={id} displayName={`Satın Alma ${order.number}`} module="purchasing" primaryEmail={order.contact?.email} recommendedActions={recommendedActions} />
        </aside>
      </div>

      <ConfirmDialog
        isOpen={sendOpen}
        onClose={() => setSendOpen(false)}
        onConfirm={() => sendOrder.mutate(id, { onSuccess: () => setSendOpen(false) })}
        title="Siparişi gönder"
        message={
          <div className="space-y-2 text-sm text-slate-300">
            <p><span className="font-medium text-white">{order.number}</span> tedarikçiye gönderilecek ve sipariş teslim alma akışına açılacak.</p>
            <p className="text-slate-500">Göndermeden önce tedarikçi, vade, kalem ve toplam tutar bilgilerini kontrol edin.</p>
          </div>
        }
        confirmLabel="Gönder"
        isLoading={sendOrder.isPending}
        variant="warning"
      />

      <ConfirmDialog
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelOrder.mutate(id, { onSuccess: () => setCancelOpen(false) })}
        title="Siparişi iptal et"
        message={
          <div className="space-y-3 text-sm text-slate-300">
            <p><span className="font-medium text-white">{order.number}</span> satın alma siparişini iptal etmek üzeresiniz.</p>
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-red-100">
              <div className="flex gap-2">
                <Ban className="mt-0.5 h-4 w-4 shrink-0" />
                <p>İptal sonrası teslim alma ve satın alma akışı durur. Bağlı irsaliye veya fatura varsa önce kontrol edin.</p>
              </div>
            </div>
          </div>
        }
        confirmLabel="Evet, iptal et"
        isLoading={cancelOrder.isPending}
      />

      <Modal
        isOpen={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        title="Teslim al"
        description="Teslim alınacak miktarları ve depoyu seçin."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReceiveOpen(false)} disabled={receiveOrder.isPending}>İptal</Button>
            <Button onClick={handleReceive} loading={receiveOrder.isPending} disabled={!canConfirmReceive}>Teslim al</Button>
          </>
        }
      >
        <div className="space-y-4">
          <WarehouseSelect label="Depo" value={selectedWarehouse} onChange={setSelectedWarehouse} required />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
            <div className="text-sm text-slate-400"><span className="font-medium text-slate-100">{receiveTotal}</span> adet teslim alınacak.</div>
            <Button variant="outline" size="sm" onClick={fillRemaining}>Tüm kalanları doldur</Button>
          </div>
          {!selectedWarehouse && <p className="text-xs text-amber-300">Teslim alma için depo seçimi zorunludur.</p>}
          {receiveLines.length === 0 && <p className="text-sm text-slate-500">Teslim alınacak açık kalem yok.</p>}
          <div className="space-y-2">
            {receiveLines.map((line) => {
              const remaining = line.quantity - line.received;
              return (
                <div key={line.itemId} className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_110px]">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-200">{line.productName}</p>
                    <p className="text-xs text-slate-500">Sipariş: {line.quantity} · Teslim edilen: {line.received} · Kalan: {remaining}</p>
                    {line.receivedQty === 0 && <Badge variant="warning">Sıfır teslim</Badge>}
                  </div>
                  <Input type="number" min={0} max={remaining} value={line.receivedQty} onChange={(event) => updateReceiveQty(line.itemId, Number(event.target.value))} className="text-right" />
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
