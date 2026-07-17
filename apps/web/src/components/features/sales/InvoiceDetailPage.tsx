'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Ban, CheckCircle2, Clock3, CreditCard, ExternalLink, FileText, Mail, Printer, ReceiptText, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { InvoiceStatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useInvoice, useCancelInvoice } from '@/hooks/useSales';
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { EntityImageManager } from '@/components/shared/EntityImageManager';
import { EntityActionPanel } from '@/components/shared/EntityActionPanel';
import { DocumentPdfThemePanel } from '@/components/features/sales/DocumentPdfThemePanel';
import type { RecommendedEntityAction } from '@/components/shared/RecommendedActionsPanel';
import type { Invoice } from '@/services/sales.service';

interface LineRow {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxAmount: number;
  lineTotal: number;
  product?: { code: string; name: string };
  taxRate?: { name: string; rate: number };
  flags: string[];
}

interface Props { id: string }
type InvoicePayment = NonNullable<Invoice['payments']>[number];
type InvoiceLine = NonNullable<Invoice['lines']>[number];

const TYPE_LABELS: Record<Invoice['type'], string> = {
  SALES: 'Satış',
  PURCHASE: 'Alış',
  RETURN_SALES: 'Satış İade',
  RETURN_PURCHASE: 'Alış İade',
};

const E_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  E_INVOICE: 'E-Fatura',
  E_ARCHIVE: 'E-Arşiv',
  E_WAYBILL: 'E-İrsaliye',
};

const E_DOCUMENT_STATUS_LABELS: Record<string, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: 'Bekliyor', variant: 'warning' },
  SENT: { label: 'Gönderildi', variant: 'info' },
  ACCEPTED: { label: 'Kabul edildi', variant: 'success' },
  REJECTED: { label: 'Reddedildi', variant: 'danger' },
  CANCELLED: { label: 'İptal', variant: 'neutral' },
  FAILED: { label: 'Hata', variant: 'danger' },
};

function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function dueState(invoice: Invoice): { label: string; variant: BadgeVariant; urgent: boolean; detail: string } {
  if (invoice.status === 'PAID') return { label: 'Ödendi', variant: 'success', urgent: false, detail: 'Tahsilat riski yok.' };
  if (invoice.status === 'CANCELLED') return { label: 'İptal', variant: 'neutral', urgent: false, detail: 'Fatura iptal edilmiş.' };
  if (!invoice.dueDate) return { label: 'Vade yok', variant: 'neutral', urgent: false, detail: 'Bu faturada vade tarihi girilmemiş.' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(invoice.dueDate);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (invoice.status === 'OVERDUE' || days < 0) {
    return { label: `${Math.abs(days)} gün gecikti`, variant: 'danger', urgent: true, detail: 'Tahsilat takibi öncelikli olmalı.' };
  }
  if (days === 0) return { label: 'Bugün vade', variant: 'warning', urgent: true, detail: 'Bugün ödeme bekleniyor.' };
  if (days <= 7) return { label: `${days} gün kaldı`, variant: 'warning', urgent: true, detail: 'Yakın vadeli fatura.' };
  return { label: `${days} gün kaldı`, variant: 'info', urgent: false, detail: 'Vade süresi devam ediyor.' };
}

function paymentSummary(invoice: Invoice): { paid: number; remaining: number; percent: number; lastPayment?: InvoicePayment } {
  const paid = (invoice.payments ?? [])
    .filter((payment) => payment.status !== 'CANCELLED' && payment.direction === 'RECEIVE')
    .reduce((sum, payment) => sum + payment.amount, 0);
  const remaining = Math.max(invoice.totalGross - paid, 0);
  const percent = invoice.totalGross > 0 ? Math.min(100, Math.round((paid / invoice.totalGross) * 100)) : 0;
  const lastPayment = [...(invoice.payments ?? [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  return { paid, remaining, percent, lastPayment };
}

function lineFlags(line: InvoiceLine): string[] {
  const flags: string[] = [];
  if (!line.product) flags.push('Ürün yok');
  if (line.unitPrice <= 0) flags.push('Sıfır fiyat');
  if (line.discount >= 20) flags.push('Yüksek iskonto');
  if (!line.taxRate) flags.push('KDV yok');
  return flags;
}

function StatCard({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail?: string; tone?: BadgeVariant }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold', tone === 'danger' ? 'text-red-300' : tone === 'warning' ? 'text-amber-300' : 'text-slate-100')}>{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function RiskBand({ invoice, due }: { invoice: Invoice; due: ReturnType<typeof dueState> }) {
  const isDraft = invoice.status === 'DRAFT';
  const needsEDocument = invoice.eDocuments?.some((doc) => doc.status === 'REJECTED' || doc.status === 'FAILED') ?? false;
  if (!due.urgent && !isDraft && !needsEDocument) return null;

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div>
          <p className="text-sm font-semibold text-amber-100">Dikkat gerektiren fatura</p>
          <p className="mt-1 text-sm text-amber-100/80">
            {due.urgent ? `${due.label}. ${due.detail} ` : ''}
            {isDraft ? 'Fatura taslak durumunda; gönderim/tahsilat akışı başlamamış. ' : ''}
            {needsEDocument ? 'E-belge tarafında hata veya ret bilgisi var.' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ invoice, due, paid }: { invoice: Invoice; due: ReturnType<typeof dueState>; paid: ReturnType<typeof paymentSummary> }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <InvoiceStatusBadge status={invoice.status} />
        <Badge variant="neutral">{TYPE_LABELS[invoice.type]}</Badge>
        <Badge variant={due.variant} dot>{due.label}</Badge>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tarih" value={formatDate(invoice.date)} />
        <StatCard label="Vade" value={invoice.dueDate ? formatDate(invoice.dueDate) : 'Vade yok'} detail={due.detail} tone={due.variant} />
        <StatCard label="Ödenen" value={formatCurrency(paid.paid, invoice.currencyCode)} detail={`%${paid.percent} tamamlandı`} tone={paid.remaining === 0 ? 'success' : 'neutral'} />
        <StatCard label="Kalan" value={formatCurrency(paid.remaining, invoice.currencyCode)} detail={paid.remaining > 0 ? 'Açık tahsilat' : 'Kapalı'} tone={paid.remaining > 0 ? 'warning' : 'success'} />
      </div>
      {invoice.notes && <p className="mt-4 border-t border-slate-800 pt-4 text-sm text-slate-400">{invoice.notes}</p>}
    </div>
  );
}

function TotalsCard({ invoice }: { invoice: Invoice }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center gap-2 text-slate-200">
        <ReceiptText className="h-4 w-4 text-sky-300" />
        <h2 className="text-sm font-semibold">Toplamlar</h2>
      </div>
      <div className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between gap-4"><span className="text-slate-500">Net tutar</span><span className="text-slate-200">{formatCurrency(invoice.totalNet, invoice.currencyCode)}</span></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">KDV</span><span className="text-slate-200">{formatCurrency(invoice.totalTax, invoice.currencyCode)}</span></div>
        <div className="border-t border-slate-800 pt-3 flex justify-between gap-4">
          <span className="text-slate-400">Genel toplam</span>
          <span className="text-xl font-bold text-white">{formatCurrency(invoice.totalGross, invoice.currencyCode)}</span>
        </div>
      </div>
    </div>
  );
}

function PaymentCard({ invoice, paid }: { invoice: Invoice; paid: ReturnType<typeof paymentSummary> }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-slate-200">
          <CreditCard className="h-4 w-4 text-emerald-300" />
          <h2 className="text-sm font-semibold">Tahsilat</h2>
        </div>
        <Badge variant={paid.remaining === 0 ? 'success' : 'warning'}>%{paid.percent}</Badge>
      </div>
      <div className="mt-4 h-2 rounded-full bg-slate-800">
        <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${paid.percent}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-xs text-slate-500">Ödenen</p><p className="font-medium text-slate-100">{formatCurrency(paid.paid, invoice.currencyCode)}</p></div>
        <div><p className="text-xs text-slate-500">Kalan</p><p className="font-medium text-slate-100">{formatCurrency(paid.remaining, invoice.currencyCode)}</p></div>
      </div>
      {paid.lastPayment ? (
        <p className="mt-3 text-xs text-slate-500">Son ödeme: {formatDate(paid.lastPayment.date)} · {formatCurrency(paid.lastPayment.amount, invoice.currencyCode)} · {paid.lastPayment.method}</p>
      ) : (
        <p className="mt-3 text-xs text-slate-500">Bu faturaya bağlı ödeme kaydı yok.</p>
      )}
    </div>
  );
}

function EDocumentCard({ invoice }: { invoice: Invoice }) {
  const documents = invoice.eDocuments ?? [];
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center gap-2 text-slate-200">
        <FileText className="h-4 w-4 text-violet-300" />
        <h2 className="text-sm font-semibold">E-belge</h2>
      </div>
      {documents.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Bu faturaya bağlı e-belge kaydı yok.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {documents.map((document) => {
            const status = E_DOCUMENT_STATUS_LABELS[document.status] ?? { label: document.status, variant: 'neutral' as BadgeVariant };
            return (
              <div key={document.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-200">{E_DOCUMENT_TYPE_LABELS[document.type] ?? document.type}</p>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
                <p className="mt-2 text-xs text-slate-500">{document.uuid ?? document.providerCode ?? 'Sağlayıcı referansı yok'}</p>
                {document.providerMessage && <p className="mt-2 text-xs text-slate-400">{document.providerMessage}</p>}
                <p className="mt-2 text-xs text-slate-600">Oluşturma: {formatDateTime(document.createdAt)}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ContactAndSourceCard({ invoice }: { invoice: Invoice }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-sm font-semibold text-slate-200">Cari ve kaynak</h2>
      <div className="mt-4 space-y-3 text-sm">
        <div>
          <p className="text-xs text-slate-500">Cari</p>
          {invoice.contact ? (
            <Link href={`/dashboard/contacts/${invoice.contact.id}`} className="inline-flex items-center gap-1 font-medium text-sky-300 hover:text-sky-200">
              {invoice.contact.name}
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : (
            <p className="text-slate-400">Cari bilgisi yok</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><p className="text-xs text-slate-500">Vergi no</p><p className="text-slate-300">{invoice.contact?.taxNumber ?? 'Yok'}</p></div>
          <div><p className="text-xs text-slate-500">E-posta</p><p className="truncate text-slate-300">{invoice.contact?.email ?? 'Yok'}</p></div>
        </div>
        <div className="border-t border-slate-800 pt-3">
          <p className="text-xs text-slate-500">Kaynak kayıt</p>
          {invoice.salesOrderId ? (
            <Link href={`/dashboard/sales-orders/${invoice.salesOrderId}`} className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200">
              Satış siparişini aç
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : invoice.purchaseOrderId ? (
            <Link href={`/dashboard/purchase-orders/${invoice.purchaseOrderId}`} className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200">
              Satın alma siparişini aç
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : (
            <p className="text-slate-400">Bağlı sipariş yok</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function InvoiceDetailPage({ id }: Props) {
  const router = useRouter();
  const { data: invoice, isLoading } = useInvoice(id);
  const cancelInvoice = useCancelInvoice(id);
  const [cancelOpen, setCancelOpen] = useState(false);

  const lineColumns: ColumnDef<LineRow>[] = [
    {
      key: 'product',
      header: 'Ürün / Açıklama',
      render: (row) => (
        <div>
          <p className="text-slate-200">{row.product?.name ?? row.description}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {row.product && <span className="text-xs text-slate-500">{row.product.code} · {row.description}</span>}
            {row.flags.map((flag) => <Badge key={flag} variant={flag === 'Yüksek iskonto' ? 'warning' : 'neutral'}>{flag}</Badge>)}
          </div>
        </div>
      ),
    },
    { key: 'quantity', header: 'Miktar', width: '90px', align: 'right', render: (row) => <span className="text-slate-300">{row.quantity}</span> },
    { key: 'unitPrice', header: 'Birim Fiyat', width: '120px', align: 'right', render: (row) => <span className="text-slate-300">{formatCurrency(row.unitPrice)}</span> },
    { key: 'discount', header: 'İskonto', width: '90px', align: 'right', render: (row) => <span className={row.discount >= 20 ? 'font-medium text-amber-300' : 'text-slate-400'}>%{row.discount}</span> },
    { key: 'taxRate', header: 'KDV', width: '80px', align: 'right', render: (row) => <span className="text-slate-400">{row.taxRate ? `%${row.taxRate.rate}` : 'Yok'}</span> },
    { key: 'taxAmount', header: 'KDV Tutarı', width: '120px', align: 'right', render: (row) => <span className="text-slate-400">{formatCurrency(row.taxAmount)}</span> },
    { key: 'lineTotal', header: 'Toplam', width: '130px', align: 'right', render: (row) => <span className="font-medium text-slate-200">{formatCurrency(row.lineTotal)}</span> },
  ];

  if (isLoading) return <FullPageSpinner />;
  if (!invoice) return <div className="text-sm text-slate-400">Fatura bulunamadı.</div>;

  const canCancel = invoice.status !== 'CANCELLED' && invoice.status !== 'PAID';
  const due = dueState(invoice);
  const paid = paymentSummary(invoice);
  const hasOpenAmount = paid.remaining > 0 && invoice.status !== 'CANCELLED';
  const recommendedActions: RecommendedEntityAction[] = due.urgent && invoice.contact?.email
    ? [{
        id: `invoice-${id}-payment-reminder`,
        kind: 'mail',
        title: 'Ödeme hatırlatma maili gönder',
        summary: `${invoice.number} için ${formatCurrency(paid.remaining, invoice.currencyCode)} açık tutar görünüyor. Müşteriye net bir tahsilat hatırlatması gönderilebilir.`,
        priority: invoice.status === 'OVERDUE' ? 'CRITICAL' : 'HIGH',
        entityType: 'INVOICE',
        entityId: id,
        module: 'invoicing',
        href: `/dashboard/invoices/${id}`,
        steps: ['Öneriyi gör', 'Mail taslağını incele', 'Onayla', 'Mail merkezinde sonucu takip et'],
        draft: {
          to: invoice.contact.email,
          subject: `${invoice.number} numaralı fatura ödeme hatırlatması`,
          body: [
            `Merhaba ${invoice.contact.name},`,
            '',
            `${invoice.number} numaralı ve ${formatCurrency(invoice.totalGross, invoice.currencyCode)} tutarındaki faturanız için ${formatCurrency(paid.remaining, invoice.currencyCode)} açık bakiye görünmektedir.`,
            invoice.dueDate ? `Vade tarihi: ${formatDate(invoice.dueDate)}.` : 'Faturada vade tarihi bulunmuyor.',
            'Ödemeniz yapıldıysa bu mesajı dikkate almayabilirsiniz. Destek ihtiyacınız olursa bizimle iletişime geçebilirsiniz.',
            '',
            'İyi çalışmalar.',
          ].join('\n'),
        },
      }]
    : due.urgent
      ? [{
          id: `invoice-${id}-collection-task`,
          kind: 'task',
          title: 'Tahsilat takip görevi oluştur',
          summary: 'Fatura gecikmiş veya yakın vadeli görünüyor ancak müşteri e-posta bilgisi yok. Önce iletişim/tahsilat görevi açılmalı.',
          priority: 'HIGH',
          entityType: 'INVOICE',
          entityId: id,
          module: 'invoicing',
          href: `/dashboard/invoices/${id}`,
          steps: ['Öneriyi gör', 'Görev taslağını incele', 'Onayla', 'Workflow’da takip et'],
          draft: {
            title: `${invoice.number} tahsilat takibi`,
            detail: `${invoice.contact?.name ?? 'Cari'} için ${formatCurrency(paid.remaining || invoice.totalGross, invoice.currencyCode)} açık tutarı takip et. Eksik e-posta/iletişim bilgisini tamamla.`,
            type: 'COLLECTION',
            dueAt: addDays(1),
          },
        }]
      : [];

  const lineRows: LineRow[] = (invoice.lines ?? []).map((line) => ({
    id: line.id,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discount: line.discount,
    taxAmount: line.taxAmount,
    lineTotal: line.lineTotal,
    product: line.product ? { code: line.product.code, name: line.product.name } : undefined,
    taxRate: line.taxRate ? { name: line.taxRate.name, rate: line.taxRate.rate } : undefined,
    flags: lineFlags(line),
  }));
  const printableLines = lineRows.map((line) => ({
    id: line.id,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discount: line.discount,
    taxAmount: line.taxAmount,
    taxRate: line.taxRate?.rate,
    lineTotal: line.lineTotal,
    product: line.product,
  }));

  const headerActions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button variant="outline" size="sm" leftIcon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>PDF / Yazdır</Button>
      <Button
        variant="outline"
        size="sm"
        leftIcon={<Mail className="h-3.5 w-3.5" />}
        disabled={!invoice.contact?.email}
        onClick={() => {
          if (invoice.contact?.email) {
            window.location.href = `mailto:${invoice.contact.email}?subject=${encodeURIComponent(`${invoice.number} numaralı fatura`)}`;
          }
        }}
      >
        Mail
      </Button>
      {hasOpenAmount && <Button size="sm" leftIcon={<CreditCard className="h-3.5 w-3.5" />} onClick={() => router.push(`/dashboard/payments/new?invoiceId=${invoice.id}`)}>Tahsilat al</Button>}
      {canCancel && (
        <Button variant="danger" size="sm" leftIcon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setCancelOpen(true)}>İptal et</Button>
      )}
    </div>
  );

  const cancelMessage = (
    <div className="space-y-3 text-sm text-slate-300">
      <p><span className="font-medium text-white">{invoice.number}</span> faturasını iptal etmek üzeresiniz.</p>
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-red-100">
        <div className="flex gap-2">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" />
          <p>İptal işlemi muhasebe kaydını ters çevirebilir ve fatura artık tahsilat/gönderim akışında kullanılamaz.</p>
        </div>
      </div>
      <p className="text-slate-500">Ödenmiş faturalar iptal edilemez. Devam etmeden önce bağlı ödeme ve e-belge kayıtlarını kontrol edin.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Fatura ${invoice.number}`}
        subtitle={invoice.contact?.name}
        action={headerActions}
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={() => router.push('/dashboard/invoices')}>Listeye dön</Button>
        {invoice.salesOrderId && (
          <Button variant="ghost" size="sm" leftIcon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => router.push(`/dashboard/sales-orders/${invoice.salesOrderId}`)}>Siparişi aç</Button>
        )}
      </div>

      <RiskBand invoice={invoice} due={due} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-6">
          <SummaryCard invoice={invoice} due={due} paid={paid} />

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">Fatura kalemleri</h2>
                <p className="text-xs text-slate-500">{lineRows.length} satır · eksik ürün, sıfır fiyat ve yüksek iskonto işaretlenir.</p>
              </div>
              {lineRows.every((line) => line.flags.length === 0) && (
                <Badge variant="success" dot><CheckCircle2 className="h-3 w-3" /> Kontrol temiz</Badge>
              )}
            </div>
            <DataTable
              columns={lineColumns}
              data={lineRows}
              keyExtractor={(row) => row.id}
              emptyTitle="Fatura kalemi yok"
              emptyDescription="Bu faturada satır bulunmuyor. Kayıt eksik veya hatalı oluşturulmuş olabilir."
              density="compact"
            />
          </section>

          <DocumentPdfThemePanel
            kind="invoice"
            number={invoice.number}
            contactName={invoice.contact?.name}
            contactTaxNumber={invoice.contact?.taxNumber}
            date={invoice.date}
            dueDateLabel="Vade"
            dueDate={invoice.dueDate}
            notes={invoice.notes}
            totalNet={invoice.totalNet}
            totalTax={invoice.totalTax}
            totalGross={invoice.totalGross}
            lines={printableLines}
          />

          <EntityImageManager
            entityType="INVOICE"
            entityId={id}
            label="Belge görseli"
            description="Taranmış fatura, fiş veya belge fotoğrafı yükleyin."
          />
        </main>

        <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <TotalsCard invoice={invoice} />
          <PaymentCard invoice={invoice} paid={paid} />
          <EDocumentCard invoice={invoice} />
          <ContactAndSourceCard invoice={invoice} />
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center gap-2 text-slate-200">
              <Clock3 className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold">Kayıt bilgisi</h2>
            </div>
            <div className="mt-4 space-y-2 text-xs text-slate-500">
              <p>Oluşturma: {formatDateTime(invoice.createdAt)}</p>
              <p>Güncelleme: {formatDateTime(invoice.updatedAt)}</p>
            </div>
          </div>
          <EntityActionPanel
            entityType="INVOICE"
            entityId={id}
            displayName={`Fatura ${invoice.number}`}
            module="invoicing"
            primaryEmail={invoice.contact?.email}
            recommendedActions={recommendedActions}
          />
        </aside>
      </div>

      <ConfirmDialog
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelInvoice.mutate(undefined, { onSuccess: () => setCancelOpen(false) })}
        title="Faturayı iptal et"
        message={cancelMessage}
        confirmLabel="Evet, iptal et"
        isLoading={cancelInvoice.isPending}
      />
    </div>
  );
}
