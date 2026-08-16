import { InvoiceStatus, type Invoice, type Prisma, type PrismaClient } from '@prisma/client';

type FinancialDbClient = PrismaClient | Prisma.TransactionClient;

export interface InvoicePaymentSnapshot {
  totalGross: Prisma.Decimal | number;
  dueDate: Date | null;
  status: InvoiceStatus;
  payments?: Array<{ amount: Prisma.Decimal | number }>;
}

export interface InvoiceStatusComputation {
  status: InvoiceStatus;
  paidAmount: number;
  balance: number;
}

export function computeInvoiceStatus(
  invoice: InvoicePaymentSnapshot,
  asOf: Date = new Date(),
): InvoiceStatusComputation {
  const currentStatus = invoice.status;
  const paidAmount = (invoice.payments ?? []).reduce((sum, allocation) => sum + Number(allocation.amount), 0);
  const totalGross = Number(invoice.totalGross);
  const balance = Math.max(0, totalGross - paidAmount);

  if (currentStatus === InvoiceStatus.CANCELLED || currentStatus === InvoiceStatus.DRAFT) {
    return { status: currentStatus, paidAmount, balance };
  }

  if (paidAmount >= totalGross && totalGross > 0) {
    return { status: InvoiceStatus.PAID, paidAmount, balance: 0 };
  }

  if (paidAmount > 0) {
    return { status: InvoiceStatus.PARTIALLY_PAID, paidAmount, balance };
  }

  if (invoice.dueDate && invoice.dueDate.getTime() < startOfDay(asOf).getTime()) {
    return { status: InvoiceStatus.OVERDUE, paidAmount, balance };
  }

  return { status: InvoiceStatus.SENT, paidAmount, balance };
}

export async function recomputeInvoiceStatus(
  db: FinancialDbClient,
  tenantId: string,
  invoiceId: string,
  options: { userId?: string | null; note?: string; asOf?: Date } = {},
): Promise<Invoice | null> {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId, deletedAt: null },
    include: { payments: { select: { amount: true } } },
  });
  if (!invoice) return null;

  const next = computeInvoiceStatus(invoice, options.asOf);
  if (next.status === invoice.status) return invoice;

  const updated = await db.invoice.update({
    where: { id: invoice.id },
    data: { status: next.status },
  });

  await db.invoiceHistory.create({
    data: {
      tenantId,
      invoiceId: invoice.id,
      fromStatus: invoice.status,
      toStatus: next.status,
      notes: options.note ?? `Otomatik durum hesaplama: paid=${next.paidAmount.toFixed(2)}, balance=${next.balance.toFixed(2)}`,
      createdById: options.userId ?? null,
    },
  });

  return updated;
}

export interface InvoiceStatusScanResult {
  scanned: number;
  changed: number;
}

export async function scanAndRecomputeInvoiceStatuses(
  db: FinancialDbClient,
  tenantId: string,
  options: { userId?: string | null; asOf?: Date; limit?: number } = {},
): Promise<InvoiceStatusScanResult> {
  const invoices = await db.invoice.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
    },
    select: { id: true },
    take: Math.min(Math.max(options.limit ?? 500, 1), 1000),
    orderBy: { dueDate: 'asc' },
  });

  let changed = 0;
  for (const invoice of invoices) {
    const before = await db.invoice.findFirst({
      where: { id: invoice.id, tenantId },
      select: { status: true },
    });
    const after = await recomputeInvoiceStatus(db, tenantId, invoice.id, {
      userId: options.userId,
      asOf: options.asOf,
      note: 'Planli fatura durum taramasi ile otomatik hesaplandi.',
    });
    if (before && after && before.status !== after.status) changed += 1;
  }

  return { scanned: invoices.length, changed };
}

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}
