import { InvoiceStatus, type Prisma } from '@prisma/client';

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

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function computeInvoiceStatus(
  invoice: InvoicePaymentSnapshot,
  asOf: Date = new Date(),
): InvoiceStatusComputation {
  const paidAmount = (invoice.payments ?? []).reduce((sum, allocation) => sum + Number(allocation.amount), 0);
  const totalGross = Number(invoice.totalGross);
  const balance = Math.max(0, totalGross - paidAmount);

  if (invoice.status === InvoiceStatus.CANCELLED || invoice.status === InvoiceStatus.DRAFT) {
    return { status: invoice.status, paidAmount, balance };
  }
  if (paidAmount >= totalGross && totalGross > 0) return { status: InvoiceStatus.PAID, paidAmount, balance: 0 };
  if (paidAmount > 0) return { status: InvoiceStatus.PARTIALLY_PAID, paidAmount, balance };
  if (invoice.dueDate && invoice.dueDate.getTime() < startOfDay(asOf).getTime()) {
    return { status: InvoiceStatus.OVERDUE, paidAmount, balance };
  }
  return { status: InvoiceStatus.SENT, paidAmount, balance };
}
