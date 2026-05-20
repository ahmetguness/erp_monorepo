'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { QuoteStatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useSalesQuote, useConvertQuoteToOrder } from '@/hooks/useSales';
import { formatCurrency, formatDate } from '@/lib/utils';
import { EntityActionPanel } from '@/components/shared/EntityActionPanel';

interface LineRow {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  lineTotal: number;
  product?: { code: string; name: string };
}

interface Props { id: string }

export function SalesQuoteDetailPage({ id }: Props) {
  const router = useRouter();
  const { data: quote, isLoading } = useSalesQuote(id);
  const convertToOrder = useConvertQuoteToOrder(id);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const lineColumns: ColumnDef<LineRow>[] = [
    {
      key: 'product', header: 'Ürün / Açıklama',
      render: (r) => (
        <div>
          <p className="text-slate-200">{r.product?.name ?? r.description}</p>
          {r.product && <p className="text-xs text-slate-500">{r.description}</p>}
        </div>
      ),
    },
    { key: 'quantity', header: 'Miktar', width: '90px', align: 'right', render: (r) => <span className="text-slate-300">{r.quantity}</span> },
    { key: 'unitPrice', header: 'Birim Fiyat', width: '120px', align: 'right', render: (r) => <span className="text-slate-300">{formatCurrency(r.unitPrice)}</span> },
    { key: 'discount', header: 'İskonto', width: '80px', align: 'right', render: (r) => <span className="text-slate-400">%{r.discount}</span> },
    { key: 'taxRate', header: 'KDV', width: '70px', align: 'right', render: (r) => <span className="text-slate-400">%{r.taxRate}</span> },
    { key: 'lineTotal', header: 'Toplam', width: '120px', align: 'right', render: (r) => <span className="font-medium text-slate-200">{formatCurrency(r.lineTotal)}</span> },
  ];

  if (isLoading) return <FullPageSpinner />;
  if (!quote) return <div className="text-slate-400 text-sm">Teklif bulunamadı.</div>;

  const canConvert = quote.status === 'DRAFT' || quote.status === 'SENT';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Teklif ${quote.number}`}
        subtitle={quote.contact?.name}
        action={
          canConvert && (
            <Button leftIcon={<ArrowRight className="w-4 h-4" />} onClick={() => setConfirmOpen(true)}>
              Siparişe Dönüştür
            </Button>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-3 mb-2">
          <QuoteStatusBadge status={quote.status} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><p className="text-slate-500 text-xs">Tarih</p><p className="text-slate-200">{formatDate(quote.date)}</p></div>
          <div><p className="text-slate-500 text-xs">Geçerlilik</p><p className="text-slate-200">{quote.validUntil ? formatDate(quote.validUntil) : '—'}</p></div>
          <div><p className="text-slate-500 text-xs">Net Tutar</p><p className="text-slate-200">{formatCurrency(quote.totalNet)}</p></div>
          <div><p className="text-slate-500 text-xs">Genel Toplam</p><p className="text-white font-semibold text-base">{formatCurrency(quote.totalGross)}</p></div>
        </div>
        {quote.notes && <p className="text-sm text-slate-400 pt-2 border-t border-slate-800">{quote.notes}</p>}
      </div>

      <DataTable
        columns={lineColumns}
        data={(quote.items ?? []) as LineRow[]}
        keyExtractor={(r) => r.id}
        emptyTitle="Kalem bulunamadı"
      />

        </main>

      <EntityActionPanel
        entityType="SALES_QUOTE"
        entityId={id}
        displayName={`Teklif ${quote.number}`}
        module="sales"
        primaryEmail={quote.contact?.email}
        availableActions={['mail', 'task', 'attachment', 'note', 'activity']}
      />
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => convertToOrder.mutate(undefined, {
          onSuccess: (order) => { setConfirmOpen(false); router.push(`/dashboard/sales-orders/${order.id}`); },
        })}
        title="Siparişe Dönüştür"
        message={`"${quote.number}" teklifini satış siparişine dönüştürmek istediğinize emin misiniz?`}
        confirmLabel="Dönüştür"
        isLoading={convertToOrder.isPending}
        variant="warning"
      />
    </div>
  );
}
