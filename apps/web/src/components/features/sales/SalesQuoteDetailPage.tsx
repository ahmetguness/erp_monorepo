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
import { DocumentPdfThemePanel } from '@/components/features/sales/DocumentPdfThemePanel';
import { SalesConversionFlowCard } from '@/components/features/sales/SalesConversionFlowCard';
import type { RecommendedEntityAction } from '@/components/shared/RecommendedActionsPanel';

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

function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

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
  const validityDays = daysUntil(quote.validUntil);
  const highDiscountLines = (quote.items ?? []).filter((item) => Number(item.discount) >= 15);
  const recommendedActions: RecommendedEntityAction[] = [
    ...(canConvert && quote.contact?.email && validityDays !== null && validityDays <= 7
      ? [{
          id: `quote-${id}-followup-mail`,
          kind: 'mail' as const,
          title: validityDays < 0 ? 'Geçerliliği biten teklif için takip maili' : 'Teklif takip maili gönder',
          summary: validityDays < 0
            ? 'Teklif geçerlilik tarihi geçmiş. Müşteriden karar veya revizyon talebi alınmalı.'
            : `Teklifin geçerliliğine ${validityDays} gün kaldı. Karar sürecini hızlandırmak için takip maili önerilir.`,
          priority: validityDays < 0 ? 'HIGH' as const : 'MEDIUM' as const,
          entityType: 'SALES_QUOTE' as const,
          entityId: id,
          module: 'sales',
          href: `/dashboard/sales-orders/quotes/${id}`,
          steps: ['Öneriyi gör', 'Mail taslağını incele', 'Onayla', 'Mail merkezinde sonucu takip et'],
          draft: {
            to: quote.contact.email,
            subject: `${quote.number} numaralı teklif hakkında`,
            body: [
              `Merhaba ${quote.contact.name},`,
              '',
              `${quote.number} numaralı ${formatCurrency(quote.totalGross)} tutarındaki teklifimizle ilgili karar sürecinizi takip etmek istedik.`,
              'Revizyon, ek bilgi veya siparişe dönüştürme için yardımcı olmaktan memnuniyet duyarız.',
              '',
              'İyi çalışmalar.',
            ].join('\n'),
          },
        }]
      : []),
    ...(canConvert && highDiscountLines.length > 0
      ? [{
          id: `quote-${id}-margin-review`,
          kind: 'task' as const,
          title: 'İskonto/marj kontrol görevi oluştur',
          summary: `${highDiscountLines.length} kalemde yüksek iskonto var. Siparişe dönmeden önce marj onayı alınmalı.`,
          priority: 'HIGH' as const,
          entityType: 'SALES_QUOTE' as const,
          entityId: id,
          module: 'sales',
          href: `/dashboard/sales-orders/quotes/${id}`,
          steps: ['Öneriyi gör', 'Görev taslağını incele', 'Onayla', 'Workflow’da takip et'],
          draft: {
            title: `${quote.number} iskonto/marj kontrolü`,
            detail: [
              `${quote.number} teklifinde yüksek iskonto içeren kalemler var.`,
              ...highDiscountLines.map((item) => `- ${item.product?.name ?? item.description}: %${item.discount} iskonto, toplam ${formatCurrency(item.lineTotal)}`),
              'Siparişe dönüştürmeden önce kârlılık ve onay durumunu kontrol edin.',
            ].join('\n'),
            type: 'CHECK' as const,
            dueAt: addDays(1),
          },
        }]
      : []),
  ];
  const lineRows: LineRow[] = (quote.items ?? []).map((item) => ({
    id: item.id,
    description: item.description ?? '',
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discount: item.discount,
    taxRate: item.taxRate,
    lineTotal: item.lineTotal,
    product: item.product ? { code: item.product.code, name: item.product.name } : undefined,
  }));

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
      <SalesConversionFlowCard stage="quote" compact />

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
        data={lineRows}
        keyExtractor={(r) => r.id}
        emptyTitle="Kalem bulunamadı"
      />

      <DocumentPdfThemePanel
        kind="quote"
        number={quote.number}
        contactName={quote.contact?.name}
        date={quote.date}
        dueDateLabel="Geçerlilik"
        dueDate={quote.validUntil}
        notes={quote.notes}
        totalNet={quote.totalNet}
        totalTax={quote.totalTax}
        totalGross={quote.totalGross}
        lines={lineRows}
      />

        </main>

      <EntityActionPanel
        entityType="SALES_QUOTE"
        entityId={id}
        displayName={`Teklif ${quote.number}`}
        module="sales"
        primaryEmail={quote.contact?.email}
        availableActions={['mail', 'task', 'attachment', 'note', 'activity']}
        recommendedActions={recommendedActions}
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
