import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { InvoiceStatus, OrderStatus, QuoteStatus, PaymentStatus, FiscalPeriodStatus } from '@repo/types';

// ─────────────────────────────────────────────
// Invoice Status
// ─────────────────────────────────────────────

const INVOICE_STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  DRAFT:         { label: 'Taslak',    variant: 'neutral' },
  SENT:          { label: 'Gönderildi', variant: 'info' },
  PAID:          { label: 'Ödendi',    variant: 'success' },
  PARTIALLY_PAID:{ label: 'Kısmi',     variant: 'warning' },
  OVERDUE:       { label: 'Gecikmiş',  variant: 'danger' },
  CANCELLED:     { label: 'İptal',     variant: 'neutral' },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus | string }) {
  const config = INVOICE_STATUS_CONFIG[status] ?? { label: status, variant: 'neutral' as BadgeVariant };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// ─────────────────────────────────────────────
// Order Status
// ─────────────────────────────────────────────

const ORDER_STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  DRAFT:               { label: 'Taslak',       variant: 'neutral' },
  CONFIRMED:           { label: 'Onaylandı',    variant: 'info' },
  PARTIALLY_DELIVERED: { label: 'Kısmi Teslimat', variant: 'warning' },
  DELIVERED:           { label: 'Teslim Edildi', variant: 'success' },
  CANCELLED:           { label: 'İptal',        variant: 'neutral' },
};

export function OrderStatusBadge({ status }: { status: OrderStatus | string }) {
  const config = ORDER_STATUS_CONFIG[status] ?? { label: status, variant: 'neutral' as BadgeVariant };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// ─────────────────────────────────────────────
// Quote Status
// ─────────────────────────────────────────────

const QUOTE_STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  DRAFT:     { label: 'Taslak',    variant: 'neutral' },
  SENT:      { label: 'Gönderildi', variant: 'info' },
  ACCEPTED:  { label: 'Kabul',      variant: 'success' },
  REJECTED:  { label: 'Reddedildi', variant: 'danger' },
  EXPIRED:   { label: 'Süresi Doldu', variant: 'warning' },
  CANCELLED: { label: 'İptal',      variant: 'neutral' },
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus | string }) {
  const config = QUOTE_STATUS_CONFIG[status] ?? { label: status, variant: 'neutral' as BadgeVariant };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// ─────────────────────────────────────────────
// Payment Status
// ─────────────────────────────────────────────

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  PENDING:   { label: 'Bekliyor',   variant: 'warning' },
  COMPLETED: { label: 'Tamamlandı', variant: 'success' },
  FAILED:    { label: 'Başarısız',  variant: 'danger' },
  CANCELLED: { label: 'İptal',      variant: 'neutral' },
  REFUNDED:  { label: 'İade',       variant: 'purple' },
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus | string }) {
  const config = PAYMENT_STATUS_CONFIG[status] ?? { label: status, variant: 'neutral' as BadgeVariant };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// ─────────────────────────────────────────────
// Fiscal Period Status
// ─────────────────────────────────────────────

const FISCAL_STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  OPEN:   { label: 'Açık',   variant: 'success' },
  CLOSED: { label: 'Kapalı', variant: 'neutral' },
  LOCKED: { label: 'Kilitli', variant: 'danger' },
};

export function FiscalPeriodStatusBadge({ status }: { status: FiscalPeriodStatus | string }) {
  const config = FISCAL_STATUS_CONFIG[status] ?? { label: status, variant: 'neutral' as BadgeVariant };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// ─────────────────────────────────────────────
// Active / Passive
// ─────────────────────────────────────────────

export function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? 'success' : 'neutral'}>
      {isActive ? 'Aktif' : 'Pasif'}
    </Badge>
  );
}
