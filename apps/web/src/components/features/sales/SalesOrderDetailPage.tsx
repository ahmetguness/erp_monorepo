'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { OrderStatusBadge, InvoiceStatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { AttachmentPanel } from '@/components/shared/AttachmentPanel';
import { useSalesOrder, useCancelSalesOrder, useUpdateSalesOrder } from '@/hooks/useSales';
import { formatCurrency, formatDate } from '@/lib/utils';

interface LineRow { id: string; description: string; quantity: number; unitPrice: number; discount: number; taxRate: number; lineTotal: number; product?: { code: string; name: string } }
interface InvoiceRef { id: string; number: string; status: string; totalGross: number }

interface Props { id: string }

export function SalesOrderDetailPage({ id }: Props) {
  const router = useRouter();
  const { data: order, isLoading } = useSalesOrder(id);
  const cancelOrder = useCancelSalesOrder(id);
  const updateOrder = useUpdateSalesOrder(id);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const lineColumns: ColumnDef<LineRow>[] = [
    { key: 'product', header: 'Ürün', render: (r) => <div><p className="text-slate-200">{r.product?.name ?? r.description}</p>{r.product && <p className="text-xs text-slate-500">{r.description}</p>}</div> },
    { key: 'quantity', header: 'Miktar', width: '90px', align: 'right', render: (r) => <span className="text-slate-300">{r.quantity}</span> },
    { key: 'unitPrice', header: 'Birim Fiyat', width: '120px', align: 'right', render: (r) => <span className="text-slate-300">{formatCurrency(r.unitPrice)}</span> },
    { key: 'discount', header: 'İskonto', width: '80px', align: 'right', render: (r) => <span className="text-slate-400">%{r.discount}</span> },
    { key: 'lineTotal', header: 'Toplam', width: '120px', align: 'right', render: (r) => <span className="font-medium text-slate-200">{formatCurrency(r.lineTotal)}</span> },
  ];

  const invoiceColumns: ColumnDef<InvoiceRef>[] = [
    { key: 'number', header: 'Fatura No', render: (r) => <span className="font-mono text-sky-400 cursor-pointer hover:underline" onClick={() => router.push(`/dashboard/invoices/${r.id}`)}>{r.number}</span> },
    { key: 'status', header: 'Durum', width: '120px', render: (r) => <InvoiceStatusBadge status={r.status} /> },
    { key: 'totalGross', header: 'Tutar', width: '130px', align: 'right', render: (r) => <span className="font-medium text-slate-200">{formatCurrency(r.totalGross)}</span> },
  ];

  if (isLoading) return <FullPageSpinner />;
  if (!order) return <div className="text-slate-400 text-sm">Sipariş bulunamadı.</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Sipariş ${order.number}`}
        subtitle={order.contact?.name}
        action={
          <div className="flex items-center gap-2">
            {order.status === 'DRAFT' && (
              <Button leftIcon={<CheckCircle className="w-4 h-4" />} onClick={() => setConfirmOpen(true)}>
                Onayla
              </Button>
            )}
            {order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && (
              <Button variant="danger" leftIcon={<XCircle className="w-4 h-4" />} onClick={() => setCancelOpen(true)}>İptal Et</Button>
            )}
          </div>
        }
      />

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4"><OrderStatusBadge status={order.status} /></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><p className="text-slate-500 text-xs">Tarih</p><p className="text-slate-200">{formatDate(order.date)}</p></div>
          <div><p className="text-slate-500 text-xs">Vade</p><p className="text-slate-200">{order.dueDate ? formatDate(order.dueDate) : '—'}</p></div>
          <div><p className="text-slate-500 text-xs">Net Tutar</p><p className="text-slate-200">{formatCurrency(order.totalNet)}</p></div>
          <div><p className="text-slate-500 text-xs">Genel Toplam</p><p className="text-white font-semibold text-base">{formatCurrency(order.totalGross)}</p></div>
        </div>
        {order.notes && <p className="text-sm text-slate-400 pt-3 mt-3 border-t border-slate-800">{order.notes}</p>}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white mb-3">Kalemler</h2>
        <DataTable columns={lineColumns} data={(order.items ?? []) as LineRow[]} keyExtractor={(r) => r.id} emptyTitle="Kalem bulunamadı" />
      </div>

      {(order.invoices ?? []).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-white mb-3">Faturalar</h2>
          <DataTable columns={invoiceColumns} data={order.invoices as InvoiceRef[]} keyExtractor={(r) => r.id} emptyTitle="Fatura yok" />
        </div>
      )}

      {/* Attachments */}
      <AttachmentPanel entityType="SALES_ORDER" entityId={id} />

      {/* Confirm Order */}
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => updateOrder.mutate({ status: 'CONFIRMED' }, { onSuccess: () => setConfirmOpen(false) })}
        title="Siparişi Onayla"
        message={`"${order.number}" siparişini onaylamak istediğinize emin misiniz?`}
        confirmLabel="Onayla"
        isLoading={updateOrder.isPending}
        variant="warning"
      />

      <ConfirmDialog
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelOrder.mutate(undefined, { onSuccess: () => setCancelOpen(false) })}
        message={`"${order.number}" siparişini iptal etmek istediğinize emin misiniz?`}
        isLoading={cancelOrder.isPending}
      />
    </div>
  );
}
