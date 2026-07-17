'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle,
  ClipboardEdit,
  FileText,
  Mail,
  PackageCheck,
  Percent,
  Receipt,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { OrderStatusBadge, InvoiceStatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { EntityActionPanel } from '@/components/shared/EntityActionPanel';
import { SalesConversionFlowCard } from '@/components/features/sales/SalesConversionFlowCard';
import { DocumentPdfThemePanel } from '@/components/features/sales/DocumentPdfThemePanel';
import { useSalesOrder, useCancelSalesOrder, useUpdateSalesOrder } from '@/hooks/useSales';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { RecommendedEntityAction } from '@/components/shared/RecommendedActionsPanel';
import type { SalesOrder } from '@/services/sales.service';

interface LineRow {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  taxAmount?: number;
  lineTotal: number;
  product?: { code: string; name: string };
}

interface InvoiceRef {
  id: string;
  number: string;
  status: string;
  totalGross: number;
}

interface Props {
  id: string;
}

function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function dueDateState(order: SalesOrder): { label: string; variant: BadgeVariant; urgent: boolean } {
  const days = daysUntil(order.dueDate);
  if (order.status === 'DELIVERED') return { label: 'Teslim edildi', variant: 'success', urgent: false };
  if (order.status === 'CANCELLED') return { label: 'İptal', variant: 'neutral', urgent: false };
  if (days === null) return { label: 'Vade yok', variant: 'neutral', urgent: false };
  if (days < 0) return { label: 'Gecikti', variant: 'danger', urgent: true };
  if (days === 0) return { label: 'Bugün', variant: 'warning', urgent: true };
  if (days <= 7) return { label: `${days} gün kaldı`, variant: 'warning', urgent: true };
  return { label: `${days} gün kaldı`, variant: 'neutral', urgent: false };
}

function invoiceProgress(order: SalesOrder) {
  const total = Math.max(0, Number(order.totalGross) || 0);
  const invoiced = Math.max(0, Number(order.invoicedAmount) || 0);
  const remaining = Math.max(0, total - invoiced);
  const percent = total > 0 ? Math.min(100, Math.round((invoiced / total) * 100)) : 0;
  const complete = remaining <= 0;
  const partial = !complete && invoiced > 0;
  const label = complete ? 'Tamamlandı' : partial ? `%${percent} faturalandı` : 'Faturalanmadı';
  return { total, invoiced, remaining, percent, complete, partial, label };
}

function DueDateBadge({ order }: { order: SalesOrder }) {
  const state = dueDateState(order);
  return (
    <div className="flex flex-col gap-1">
      <Badge variant={state.variant}>{state.label}</Badge>
      <span className="text-[11px] text-slate-500">{order.dueDate ? formatDate(order.dueDate) : '—'}</span>
    </div>
  );
}

function InvoiceProgressCard({ order }: { order: SalesOrder }) {
  const progress = invoiceProgress(order);
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Faturalama durumu</h2>
          <p className="mt-1 text-xs text-slate-500">{progress.label}</p>
        </div>
        <span className={progress.complete ? 'text-sm font-bold text-emerald-300' : 'text-sm font-bold text-amber-300'}>%{progress.percent}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={progress.complete ? 'h-full bg-emerald-400' : 'h-full bg-amber-400'} style={{ width: `${progress.percent}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-slate-500">Toplam</p>
          <p className="mt-1 font-semibold text-slate-200">{formatCurrency(progress.total)}</p>
        </div>
        <div>
          <p className="text-slate-500">Faturalanan</p>
          <p className="mt-1 font-semibold text-emerald-300">{formatCurrency(progress.invoiced)}</p>
        </div>
        <div>
          <p className="text-slate-500">Kalan</p>
          <p className="mt-1 font-semibold text-amber-300">{formatCurrency(progress.remaining)}</p>
        </div>
      </div>
    </section>
  );
}

function OrderRiskBand({
  order,
  highDiscountCount,
}: {
  order: SalesOrder;
  highDiscountCount: number;
}) {
  const due = dueDateState(order);
  const progress = invoiceProgress(order);
  const isDraft = order.status === 'DRAFT';
  const hasInvoiceRisk = order.status !== 'CANCELLED' && progress.remaining > 0;
  if (!due.urgent && !isDraft && !hasInvoiceRisk && highDiscountCount === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <div>
          <p className="font-semibold">Sipariş kontrolü gerekiyor</p>
          <p className="mt-1 text-amber-100/80">
            {isDraft ? 'Sipariş taslakta bekliyor. ' : ''}
            {due.urgent ? `Vade durumu: ${due.label}. ` : ''}
            {hasInvoiceRisk ? `${formatCurrency(progress.remaining)} faturalanmamış tutar var. ` : ''}
            {highDiscountCount > 0 ? `${highDiscountCount} kalemde yüksek iskonto var.` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

function OrderSummaryCard({
  order,
  lineCount,
}: {
  order: SalesOrder;
  lineCount: number;
}) {
  const progress = invoiceProgress(order);
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <OrderStatusBadge status={order.status} />
        <DueDateBadge order={order} />
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-4 xl:grid-cols-8">
        <div>
          <p className="text-xs text-slate-500">Tarih</p>
          <p className="text-slate-200">{formatDate(order.date)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Vade</p>
          <p className="text-slate-200">{order.dueDate ? formatDate(order.dueDate) : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Kalem</p>
          <p className="text-slate-200">{lineCount}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Net</p>
          <p className="text-slate-200">{formatCurrency(order.totalNet)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">KDV</p>
          <p className="text-slate-200">{formatCurrency(order.totalTax)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Genel Toplam</p>
          <p className="font-semibold text-white">{formatCurrency(order.totalGross)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Faturalanan</p>
          <p className="text-emerald-300">{formatCurrency(progress.invoiced)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Kalan</p>
          <p className={progress.remaining > 0 ? 'text-amber-300' : 'text-emerald-300'}>{formatCurrency(progress.remaining)}</p>
        </div>
      </div>
      {order.notes && <p className="mt-4 border-t border-slate-800 pt-3 text-sm text-slate-400">{order.notes}</p>}
    </section>
  );
}

function OrderTotalsCard({ order, lineRows }: { order: SalesOrder; lineRows: LineRow[] }) {
  const discountTotal = lineRows.reduce((sum, line) => {
    const grossBeforeDiscount = line.quantity * line.unitPrice;
    return sum + grossBeforeDiscount * (line.discount / 100);
  }, 0);
  const progress = invoiceProgress(order);

  return (
    <section className="flex justify-end">
      <div className="w-full rounded-lg border border-slate-800 bg-slate-900 p-4 sm:w-96">
        <div className="flex justify-between gap-4 text-sm text-slate-400">
          <span>Ara Toplam</span>
          <strong className="font-medium text-slate-200">{formatCurrency(Number(order.totalNet) + discountTotal)}</strong>
        </div>
        <div className="mt-2 flex justify-between gap-4 text-sm text-slate-400">
          <span>İskonto</span>
          <strong className="font-medium text-amber-300">{formatCurrency(discountTotal)}</strong>
        </div>
        <div className="mt-2 flex justify-between gap-4 text-sm text-slate-400">
          <span>KDV</span>
          <strong className="font-medium text-slate-200">{formatCurrency(order.totalTax)}</strong>
        </div>
        <div className="mt-3 flex justify-between gap-4 border-t border-slate-800 pt-3 text-base">
          <span className="font-semibold text-slate-100">Genel Toplam</span>
          <strong className="text-white">{formatCurrency(order.totalGross)}</strong>
        </div>
        <div className="mt-3 border-t border-slate-800 pt-3 text-sm">
          <div className="flex justify-between gap-4 text-slate-400">
            <span>Faturalanan</span>
            <strong className="font-medium text-emerald-300">{formatCurrency(progress.invoiced)}</strong>
          </div>
          <div className="mt-2 flex justify-between gap-4 text-slate-400">
            <span>Kalan</span>
            <strong className={progress.remaining > 0 ? 'font-medium text-amber-300' : 'font-medium text-emerald-300'}>{formatCurrency(progress.remaining)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function ConfirmOrderMessage({ order, lineCount }: { order: SalesOrder; lineCount: number }) {
  const due = dueDateState(order);
  const progress = invoiceProgress(order);
  return (
    <div className="space-y-3">
      <p>
        <span className="font-semibold text-slate-100">{order.number}</span> siparişini onaylamak üzeresiniz.
      </p>
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs">
        <div><span className="block text-slate-500">Cari</span><strong className="text-slate-200">{order.contact?.name ?? '—'}</strong></div>
        <div><span className="block text-slate-500">Tutar</span><strong className="text-slate-200">{formatCurrency(order.totalGross)}</strong></div>
        <div><span className="block text-slate-500">Kalem</span><strong className="text-slate-200">{lineCount}</strong></div>
        <div><span className="block text-slate-500">Vade</span><strong className={due.urgent ? 'text-amber-300' : 'text-slate-200'}>{due.label}</strong></div>
        <div><span className="block text-slate-500">Faturalanan</span><strong className="text-slate-200">{formatCurrency(progress.invoiced)}</strong></div>
        <div><span className="block text-slate-500">Kalan</span><strong className="text-slate-200">{formatCurrency(progress.remaining)}</strong></div>
      </div>
    </div>
  );
}

function CancelOrderMessage({ order, lineCount }: { order: SalesOrder; lineCount: number }) {
  const progress = invoiceProgress(order);
  return (
    <div className="space-y-3">
      <p>
        <span className="font-semibold text-slate-100">{order.number}</span> siparişini iptal etmek üzeresiniz.
      </p>
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs">
        <div><span className="block text-slate-500">Cari</span><strong className="text-slate-200">{order.contact?.name ?? '—'}</strong></div>
        <div><span className="block text-slate-500">Tutar</span><strong className="text-slate-200">{formatCurrency(order.totalGross)}</strong></div>
        <div><span className="block text-slate-500">Kalem</span><strong className="text-slate-200">{lineCount}</strong></div>
        <div><span className="block text-slate-500">Faturalanan</span><strong className="text-slate-200">{formatCurrency(progress.invoiced)}</strong></div>
      </div>
      {progress.invoiced > 0 && (
        <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          Bu sipariş için fatura kaydı var. İptal öncesi fatura sürecini kontrol edin.
        </p>
      )}
    </div>
  );
}

export function SalesOrderDetailPage({ id }: Props) {
  const router = useRouter();
  const { data: order, isLoading } = useSalesOrder(id);
  const cancelOrder = useCancelSalesOrder(id);
  const updateOrder = useUpdateSalesOrder(id);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const actionPanelRef = useRef<HTMLDivElement>(null);

  if (isLoading) return <FullPageSpinner />;
  if (!order) return <div className="text-sm text-slate-400">Sipariş bulunamadı.</div>;

  const lineRows: LineRow[] = (order.items ?? []).map((item) => ({
    id: item.id,
    description: item.description ?? '',
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discount: item.discount,
    taxRate: item.taxRate,
    taxAmount: item.taxAmount,
    lineTotal: item.lineTotal,
    product: item.product ? { code: item.product.code, name: item.product.name } : undefined,
  }));
  const invoiceRows: InvoiceRef[] = (order.invoices ?? []).map((invoice) => ({
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    totalGross: invoice.totalGross,
  }));
  const progress = invoiceProgress(order);
  const canCreateInvoice = order.status !== 'CANCELLED' && progress.remaining > 0;
  const invoiceHref = `/dashboard/invoices/new?salesOrderId=${order.id}`;
  const highDiscountLines = lineRows.filter((line) => line.discount >= 15);
  const recommendedActions: RecommendedEntityAction[] = order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && progress.remaining > 0
    ? [{
        id: `sales-order-${id}-invoice-followup`,
        kind: 'task',
        title: 'Faturalama takip görevi oluştur',
        summary: `${formatCurrency(progress.remaining)} tutarında faturalanmamış bakiye var. Sipariş kapanmadan önce faturalama takip edilmeli.`,
        priority: order.status === 'CONFIRMED' ? 'HIGH' : 'MEDIUM',
        entityType: 'SALES_ORDER',
        entityId: id,
        module: 'sales',
        href: `/dashboard/sales-orders/${id}`,
        steps: ['Öneriyi gör', 'Görev taslağını incele', 'Onayla', 'Workflow’da takip et'],
        draft: {
          title: `${order.number} faturalama takibi`,
          detail: [
            `Sipariş: ${order.number}`,
            `Müşteri: ${order.contact?.name ?? '-'}`,
            `Toplam: ${formatCurrency(order.totalGross)}`,
            `Faturalanan: ${formatCurrency(order.invoicedAmount)}`,
            `Kalan: ${formatCurrency(progress.remaining)}`,
          ].join('\n'),
          type: 'CHECK',
          dueAt: addDays(2),
        },
      }]
    : [];

  const lineColumns: ColumnDef<LineRow>[] = [
    {
      key: 'product',
      header: 'Ürün / Açıklama',
      render: (line) => (
        <div className="min-w-0">
          <p className="truncate text-slate-200">{line.product?.name ?? line.description}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {line.product?.code && <span className="font-mono text-[11px] text-slate-500">{line.product.code}</span>}
            {line.product && line.description && <span className="truncate text-[11px] text-slate-500">{line.description}</span>}
            {line.discount >= 15 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-300">
                <Percent className="h-3 w-3" />
                Yüksek iskonto
              </span>
            )}
          </div>
        </div>
      ),
    },
    { key: 'quantity', header: 'Miktar', width: '90px', align: 'right', render: (line) => <span className="text-slate-300">{line.quantity}</span> },
    { key: 'unitPrice', header: 'Birim Fiyat', width: '120px', align: 'right', render: (line) => <span className="text-slate-300">{formatCurrency(line.unitPrice)}</span> },
    { key: 'discount', header: 'İskonto', width: '85px', align: 'right', render: (line) => <span className={line.discount >= 15 ? 'font-semibold text-amber-300' : 'text-slate-400'}>%{line.discount}</span> },
    { key: 'taxRate', header: 'KDV', width: '80px', align: 'right', render: (line) => <span className="text-slate-400">%{line.taxRate}</span> },
    {
      key: 'lineTotal',
      header: 'KDV Dahil',
      width: '130px',
      align: 'right',
      render: (line) => (
        <div className="text-right">
          <span className="font-medium text-slate-200">{formatCurrency(line.lineTotal)}</span>
          <p className="text-[11px] text-slate-500">KDV {formatCurrency(line.taxAmount ?? 0)}</p>
        </div>
      ),
    },
  ];

  const invoiceColumns: ColumnDef<InvoiceRef>[] = [
    {
      key: 'number',
      header: 'Fatura No',
      render: (invoice) => (
        <button type="button" className="font-mono text-sky-400 hover:underline" onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}>
          {invoice.number}
        </button>
      ),
    },
    { key: 'status', header: 'Durum', width: '120px', render: (invoice) => <InvoiceStatusBadge status={invoice.status} /> },
    { key: 'totalGross', header: 'Tutar', width: '130px', align: 'right', render: (invoice) => <span className="font-medium text-slate-200">{formatCurrency(invoice.totalGross)}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Sipariş ${order.number}`}
        subtitle={order.contact?.name}
        action={(
          <div className="flex flex-wrap items-center gap-2">
            {order.status === 'DRAFT' && (
              <Button leftIcon={<CheckCircle className="h-4 w-4" />} onClick={() => setConfirmOpen(true)}>
                Onayla
              </Button>
            )}
            {canCreateInvoice && (
              <Button variant="secondary" leftIcon={<Receipt className="h-4 w-4" />} onClick={() => router.push(invoiceHref)}>
                Fatura Oluştur
              </Button>
            )}
            <Button variant="outline" leftIcon={<Mail className="h-4 w-4" />} onClick={() => actionPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              Mail Gönder
            </Button>
            <Button variant="ghost" leftIcon={<ClipboardEdit className="h-4 w-4" />} onClick={() => actionPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              Not / Dosya
            </Button>
            {order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && (
              <Button variant="danger" leftIcon={<XCircle className="h-4 w-4" />} onClick={() => setCancelOpen(true)}>
                İptal Et
              </Button>
            )}
          </div>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-6">
          <SalesConversionFlowCard stage="order" invoiceHref={invoiceHref} />

          <OrderRiskBand order={order} highDiscountCount={highDiscountLines.length} />

          <OrderSummaryCard order={order} lineCount={lineRows.length} />

          <InvoiceProgressCard order={order} />

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-sky-300" />
              <h2 className="text-sm font-semibold text-white">Sipariş kalemleri</h2>
            </div>
            <DataTable columns={lineColumns} data={lineRows} keyExtractor={(line) => line.id} emptyTitle="Kalem bulunamadı" density="compact" />
          </section>

          <OrderTotalsCard order={order} lineRows={lineRows} />

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-sky-300" />
                <h2 className="text-sm font-semibold text-white">Faturalar</h2>
              </div>
              {canCreateInvoice && (
                <Button size="sm" variant="secondary" leftIcon={<Receipt className="h-3.5 w-3.5" />} onClick={() => router.push(invoiceHref)}>
                  Fatura Oluştur
                </Button>
              )}
            </div>
            <DataTable
              columns={invoiceColumns}
              data={invoiceRows}
              keyExtractor={(invoice) => invoice.id}
              emptyTitle="Henüz fatura oluşturulmamış"
              emptyDescription="Bu sipariş için fatura oluşturduğunuzda burada görünecek."
              density="compact"
            />
          </section>

          <DocumentPdfThemePanel
            kind="order"
            number={order.number}
            contactName={order.contact?.name}
            date={order.date}
            dueDateLabel="Vade"
            dueDate={order.dueDate}
            notes={order.notes}
            totalNet={order.totalNet}
            totalTax={order.totalTax}
            totalGross={order.totalGross}
            lines={lineRows}
          />
        </main>

        <div ref={actionPanelRef}>
          <EntityActionPanel
            entityType="SALES_ORDER"
            entityId={id}
            displayName={`Sipariş ${order.number}`}
            module="sales"
            primaryEmail={order.contact?.email}
            recommendedActions={recommendedActions}
            href={`/dashboard/sales-orders/${id}`}
          />
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => updateOrder.mutate({ status: 'CONFIRMED' }, { onSuccess: () => setConfirmOpen(false) })}
        title="Siparişi Onayla"
        message={<ConfirmOrderMessage order={order} lineCount={lineRows.length} />}
        confirmLabel="Onayla"
        isLoading={updateOrder.isPending}
        variant="warning"
      />

      <ConfirmDialog
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelOrder.mutate(undefined, { onSuccess: () => setCancelOpen(false) })}
        title="Siparişi İptal Et"
        message={<CancelOrderMessage order={order} lineCount={lineRows.length} />}
        confirmLabel="İptal Et"
        isLoading={cancelOrder.isPending}
      />
    </div>
  );
}
