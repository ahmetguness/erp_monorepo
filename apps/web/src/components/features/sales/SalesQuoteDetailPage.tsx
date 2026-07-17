'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  ClipboardEdit,
  FileText,
  Mail,
  PackageCheck,
  Percent,
  Printer,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { QuoteStatusBadge } from '@/components/shared/StatusBadge';
import { EntityActionPanel } from '@/components/shared/EntityActionPanel';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useSalesQuote, useConvertQuoteToOrder } from '@/hooks/useSales';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DocumentPdfThemePanel } from '@/components/features/sales/DocumentPdfThemePanel';
import { SalesConversionFlowCard } from '@/components/features/sales/SalesConversionFlowCard';
import type { RecommendedEntityAction } from '@/components/shared/RecommendedActionsPanel';
import type { SalesQuote } from '@/services/sales.service';

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

function validityState(quote: SalesQuote): { label: string; variant: BadgeVariant; days: number | null; urgent: boolean } {
  const days = daysUntil(quote.validUntil);
  if (quote.status === 'ACCEPTED') return { label: 'Kabul edildi', variant: 'success', days, urgent: false };
  if (days === null) return { label: 'Tarih yok', variant: 'neutral', days, urgent: false };
  if (days < 0 || quote.status === 'EXPIRED') return { label: 'Süresi geçti', variant: 'danger', days, urgent: true };
  if (days === 0) return { label: 'Bugün bitiyor', variant: 'warning', days, urgent: true };
  if (days <= 7) return { label: `${days} gün kaldı`, variant: 'warning', days, urgent: true };
  return { label: `${days} gün kaldı`, variant: 'neutral', days, urgent: false };
}

function ValidityBadge({ quote }: { quote: SalesQuote }) {
  const state = validityState(quote);
  return (
    <div className="flex min-w-28 flex-col items-center gap-1 text-center">
      <Badge variant={state.variant} className="justify-center">
        {state.label}
      </Badge>
      <span className="text-[11px] text-slate-500">{quote.validUntil ? formatDate(quote.validUntil) : '—'}</span>
    </div>
  );
}

function QuoteAlertBand({
  quote,
  highDiscountCount,
}: {
  quote: SalesQuote;
  highDiscountCount: number;
}) {
  const state = validityState(quote);
  if (!state.urgent && highDiscountCount === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <div>
          <p className="font-semibold">Teklif kontrolü gerekiyor</p>
          <p className="mt-1 text-amber-100/80">
            {state.urgent ? `Geçerlilik durumu: ${state.label}. ` : ''}
            {highDiscountCount > 0 ? `${highDiscountCount} kalemde yüksek iskonto var.` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

function QuoteSummaryCard({
  quote,
  lineCount,
}: {
  quote: SalesQuote;
  lineCount: number;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex min-w-24 justify-center">
          <QuoteStatusBadge status={quote.status} />
        </div>
        <ValidityBadge quote={quote} />
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-6">
        <div>
          <p className="text-xs text-slate-500">Tarih</p>
          <p className="text-slate-200">{formatDate(quote.date)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Geçerlilik</p>
          <p className="text-slate-200">{quote.validUntil ? formatDate(quote.validUntil) : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Kalem</p>
          <p className="text-slate-200">{lineCount}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Net Tutar</p>
          <p className="text-slate-200">{formatCurrency(quote.totalNet)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">KDV</p>
          <p className="text-slate-200">{formatCurrency(quote.totalTax)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Genel Toplam</p>
          <p className="text-base font-semibold text-white">{formatCurrency(quote.totalGross)}</p>
        </div>
      </div>
      {quote.notes && <p className="mt-4 border-t border-slate-800 pt-3 text-sm text-slate-400">{quote.notes}</p>}
    </section>
  );
}

function QuoteTotalsCard({ quote, lineRows }: { quote: SalesQuote; lineRows: LineRow[] }) {
  const discountTotal = lineRows.reduce((sum, line) => {
    const grossBeforeDiscount = line.quantity * line.unitPrice;
    return sum + grossBeforeDiscount * (line.discount / 100);
  }, 0);

  return (
    <section className="flex justify-end">
      <div className="w-full rounded-lg border border-slate-800 bg-slate-900 p-4 sm:w-96">
        <div className="flex justify-between gap-4 text-sm text-slate-400">
          <span>Ara Toplam</span>
          <strong className="font-medium text-slate-200">{formatCurrency(Number(quote.totalNet) + discountTotal)}</strong>
        </div>
        <div className="mt-2 flex justify-between gap-4 text-sm text-slate-400">
          <span>İskonto</span>
          <strong className="font-medium text-amber-300">{formatCurrency(discountTotal)}</strong>
        </div>
        <div className="mt-2 flex justify-between gap-4 text-sm text-slate-400">
          <span>KDV</span>
          <strong className="font-medium text-slate-200">{formatCurrency(quote.totalTax)}</strong>
        </div>
        <div className="mt-3 flex justify-between gap-4 border-t border-slate-800 pt-3 text-base">
          <span className="font-semibold text-slate-100">Genel Toplam</span>
          <strong className="text-white">{formatCurrency(quote.totalGross)}</strong>
        </div>
      </div>
    </section>
  );
}

function ConvertDialogMessage({
  quote,
  lineCount,
  highDiscountCount,
}: {
  quote: SalesQuote;
  lineCount: number;
  highDiscountCount: number;
}) {
  const state = validityState(quote);
  return (
    <div className="space-y-3">
      <p>
        <span className="font-semibold text-slate-100">{quote.number}</span> teklifini satış siparişine dönüştürmek üzeresiniz.
      </p>
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs">
        <div>
          <span className="block text-slate-500">Cari</span>
          <strong className="text-slate-200">{quote.contact?.name ?? '—'}</strong>
        </div>
        <div>
          <span className="block text-slate-500">Tutar</span>
          <strong className="text-slate-200">{formatCurrency(quote.totalGross)}</strong>
        </div>
        <div>
          <span className="block text-slate-500">Kalem</span>
          <strong className="text-slate-200">{lineCount}</strong>
        </div>
        <div>
          <span className="block text-slate-500">Geçerlilik</span>
          <strong className={state.urgent ? 'text-amber-300' : 'text-slate-200'}>{state.label}</strong>
        </div>
      </div>
      {highDiscountCount > 0 && (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {highDiscountCount} kalemde yüksek iskonto var. Siparişe dönüştürmeden önce marj/onay kontrolü önerilir.
        </p>
      )}
    </div>
  );
}

export function SalesQuoteDetailPage({ id }: Props) {
  const router = useRouter();
  const { data: quote, isLoading } = useSalesQuote(id);
  const convertToOrder = useConvertQuoteToOrder(id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const actionPanelRef = useRef<HTMLDivElement>(null);

  if (isLoading) return <FullPageSpinner />;
  if (!quote) return <div className="text-sm text-slate-400">Teklif bulunamadı.</div>;

  const canConvert = quote.status === 'DRAFT' || quote.status === 'SENT';
  const validityDays = daysUntil(quote.validUntil);
  const highDiscountLines = (quote.items ?? []).filter((item) => Number(item.discount) >= 15);
  const lineRows: LineRow[] = (quote.items ?? []).map((item) => ({
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
              'Siparişe dönüştürmeden önce karlılık ve onay durumunu kontrol edin.',
            ].join('\n'),
            type: 'CHECK' as const,
            dueAt: addDays(1),
          },
        }]
      : []),
  ];

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

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Teklif ${quote.number}`}
        subtitle={quote.contact?.name}
        action={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              PDF Kaydet
            </Button>
            <Button variant="outline" leftIcon={<Mail className="h-4 w-4" />} onClick={() => actionPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              Mail Gönder
            </Button>
            <Button variant="ghost" leftIcon={<ClipboardEdit className="h-4 w-4" />} onClick={() => actionPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              Not / Dosya
            </Button>
            {canConvert && (
              <Button leftIcon={<ArrowRight className="h-4 w-4" />} onClick={() => setConfirmOpen(true)}>
                Siparişe Dönüştür
              </Button>
            )}
          </div>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-6">
          <SalesConversionFlowCard stage="quote" compact />

          <QuoteAlertBand quote={quote} highDiscountCount={highDiscountLines.length} />

          <QuoteSummaryCard quote={quote} lineCount={lineRows.length} />

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-sky-300" />
              <h2 className="text-sm font-semibold text-white">Teklif kalemleri</h2>
            </div>
            <DataTable
              columns={lineColumns}
              data={lineRows}
              keyExtractor={(line) => line.id}
              emptyTitle="Kalem bulunamadı"
              density="compact"
            />
          </section>

          <QuoteTotalsCard quote={quote} lineRows={lineRows} />

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

        <div ref={actionPanelRef}>
          <EntityActionPanel
            entityType="SALES_QUOTE"
            entityId={id}
            displayName={`Teklif ${quote.number}`}
            module="sales"
            primaryEmail={quote.contact?.email}
            availableActions={['mail', 'task', 'attachment', 'note', 'activity']}
            recommendedActions={recommendedActions}
            href={`/dashboard/sales-orders/quotes/${id}`}
          />
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => convertToOrder.mutate(undefined, {
          onSuccess: (order) => {
            setConfirmOpen(false);
            router.push(`/dashboard/sales-orders/${order.id}`);
          },
        })}
        title="Siparişe Dönüştür"
        message={<ConvertDialogMessage quote={quote} lineCount={lineRows.length} highDiscountCount={highDiscountLines.length} />}
        confirmLabel="Dönüştür"
        isLoading={convertToOrder.isPending}
        variant="warning"
      />
    </div>
  );
}
