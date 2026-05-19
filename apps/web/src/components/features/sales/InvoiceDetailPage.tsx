'use client';

import { useState } from 'react';
import { XCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { InvoiceStatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useInvoice, useCancelInvoice } from '@/hooks/useSales';
import { formatCurrency, formatDate } from '@/lib/utils';
import { AttachmentPanel } from '@/components/shared/AttachmentPanel';
import { EntityImageManager } from '@/components/shared/EntityImageManager';
import { EntityActivityTimeline } from '@/components/shared/EntityActivityTimeline';
import { EntityTaskActions } from '@/components/shared/EntityTaskActions';

interface LineRow {
  id: string; description: string; quantity: number; unitPrice: number;
  discount: number; taxAmount: number; lineTotal: number;
  product?: { code: string; name: string };
  taxRate?: { name: string; rate: number };
}

const TYPE_LABELS: Record<string, string> = {
  SALES: 'Satış', PURCHASE: 'Alış', RETURN_SALES: 'Satış İade', RETURN_PURCHASE: 'Alış İade',
};

interface Props { id: string }

export function InvoiceDetailPage({ id }: Props) {
  const { data: invoice, isLoading } = useInvoice(id);
  const cancelInvoice = useCancelInvoice(id);
  const [cancelOpen, setCancelOpen] = useState(false);

  const lineColumns: ColumnDef<LineRow>[] = [
    {
      key: 'product', header: 'Ürün / Açıklama',
      render: (r) => <div><p className="text-slate-200">{r.product?.name ?? r.description}</p>{r.product && <p className="text-xs text-slate-500">{r.description}</p>}</div>,
    },
    { key: 'quantity', header: 'Miktar', width: '90px', align: 'right', render: (r) => <span className="text-slate-300">{r.quantity}</span> },
    { key: 'unitPrice', header: 'Birim Fiyat', width: '120px', align: 'right', render: (r) => <span className="text-slate-300">{formatCurrency(r.unitPrice)}</span> },
    { key: 'discount', header: 'İskonto', width: '80px', align: 'right', render: (r) => <span className="text-slate-400">%{r.discount}</span> },
    { key: 'taxRate', header: 'KDV', width: '80px', align: 'right', render: (r) => <span className="text-slate-400">{r.taxRate ? `%${r.taxRate.rate}` : '—'}</span> },
    { key: 'taxAmount', header: 'KDV Tutarı', width: '110px', align: 'right', render: (r) => <span className="text-slate-400">{formatCurrency(r.taxAmount)}</span> },
    { key: 'lineTotal', header: 'Toplam', width: '120px', align: 'right', render: (r) => <span className="font-medium text-slate-200">{formatCurrency(r.lineTotal)}</span> },
  ];

  if (isLoading) return <FullPageSpinner />;
  if (!invoice) return <div className="text-slate-400 text-sm">Fatura bulunamadı.</div>;

  const canCancel = invoice.status !== 'CANCELLED' && invoice.status !== 'PAID';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Fatura ${invoice.number}`}
        subtitle={invoice.contact?.name}
        action={
          canCancel && (
            <Button variant="danger" leftIcon={<XCircle className="w-4 h-4" />} onClick={() => setCancelOpen(true)}>İptal Et</Button>
          )
        }
      />

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <InvoiceStatusBadge status={invoice.status} />
          <Badge variant="neutral">{TYPE_LABELS[invoice.type] ?? invoice.type}</Badge>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><p className="text-slate-500 text-xs">Tarih</p><p className="text-slate-200">{formatDate(invoice.date)}</p></div>
          <div><p className="text-slate-500 text-xs">Vade</p><p className="text-slate-200">{invoice.dueDate ? formatDate(invoice.dueDate) : '—'}</p></div>
          <div><p className="text-slate-500 text-xs">Net Tutar</p><p className="text-slate-200">{formatCurrency(invoice.totalNet)}</p></div>
          <div><p className="text-slate-500 text-xs">KDV</p><p className="text-slate-200">{formatCurrency(invoice.totalTax)}</p></div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-800 flex justify-end">
          <div className="text-right">
            <p className="text-slate-500 text-xs">Genel Toplam</p>
            <p className="text-white font-bold text-xl">{formatCurrency(invoice.totalGross)}</p>
          </div>
        </div>
        {invoice.notes && <p className="text-sm text-slate-400 pt-3 mt-3 border-t border-slate-800">{invoice.notes}</p>}
      </div>

      <DataTable
        columns={lineColumns}
        data={(invoice.lines ?? []) as LineRow[]}
        keyExtractor={(r) => r.id}
        emptyTitle="Fatura kalemi bulunamadı"
      />

      <EntityImageManager
        entityType="INVOICE"
        entityId={id}
        label="Belge görseli"
        description="Taranmış fatura, fiş veya belge fotoğrafı yükleyin."
      />

      {/* Attachments */}
      <AttachmentPanel entityType="INVOICE" entityId={id} />
      <EntityTaskActions entityType="INVOICE" entityId={id} entityLabel={`Fatura ${invoice.number}`} module="invoicing" />
      <EntityActivityTimeline entityType="INVOICE" entityId={id} />

      <ConfirmDialog
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelInvoice.mutate(undefined, { onSuccess: () => setCancelOpen(false) })}
        message={`"${invoice.number}" faturasını iptal etmek istediğinize emin misiniz?`}
        isLoading={cancelInvoice.isPending}
      />
    </div>
  );
}
