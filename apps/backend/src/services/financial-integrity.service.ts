import { FiscalPeriodStatus, Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ValidationError } from '../errors';

type FinancialDbClient = PrismaClient | Prisma.TransactionClient;

export interface JournalBalanceLine {
  debit: number;
  credit: number;
}

export interface PaymentAllocationCheck {
  invoiceId: string;
  amount: number;
}

function normalizeDate(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function assertValidFinancialDate(date: Date, label: string): void {
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${label} gecersiz tarih.`);
  }
}

export function assertJournalBalanced(lines: readonly JournalBalanceLine[]): void {
  const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new ValidationError(`Borc (${totalDebit}) ve alacak (${totalCredit}) toplamlari esit olmalidir.`);
  }
}

export async function assertAccountingPeriodOpen(
  db: FinancialDbClient,
  tenantId: string,
  date: Date,
  actionLabel: string,
): Promise<void> {
  assertValidFinancialDate(date, actionLabel);
  const normalized = normalizeDate(date);
  const closedPeriod = await db.fiscalPeriod.findFirst({
    where: {
      tenantId,
      startDate: { lte: normalized },
      endDate: { gte: normalized },
      status: { in: [FiscalPeriodStatus.CLOSED, FiscalPeriodStatus.LOCKED] },
    },
    select: { name: true, status: true },
  });

  if (closedPeriod) {
    throw new ValidationError(`${actionLabel} kapali mali doneme yazilamaz: ${closedPeriod.name} (${closedPeriod.status}).`);
  }
}

export async function resolveOpenFiscalPeriodId(
  db: FinancialDbClient,
  tenantId: string,
  date: Date,
  actionLabel: string,
): Promise<string | null> {
  await assertAccountingPeriodOpen(db, tenantId, date, actionLabel);
  const normalized = normalizeDate(date);
  const period = await db.fiscalPeriod.findFirst({
    where: {
      tenantId,
      startDate: { lte: normalized },
      endDate: { gte: normalized },
      status: FiscalPeriodStatus.OPEN,
    },
    select: { id: true },
  });
  return period?.id ?? null;
}

export async function assertPaymentAllocationsWithinInvoiceBalance(
  db: FinancialDbClient,
  tenantId: string,
  allocations: readonly PaymentAllocationCheck[],
): Promise<void> {
  if (allocations.length === 0) return;

  const invoiceIds = allocations.map((allocation) => allocation.invoiceId);
  const invoices = await db.invoice.findMany({
    where: { tenantId, id: { in: invoiceIds }, deletedAt: null },
    select: { id: true, number: true, totalGross: true },
  });
  const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));

  const existingAllocations = await db.paymentAllocation.groupBy({
    by: ['invoiceId'],
    where: { tenantId, invoiceId: { in: invoiceIds } },
    _sum: { amount: true },
  });
  const existingByInvoiceId = new Map(existingAllocations.map((allocation) => [
    allocation.invoiceId,
    Number(allocation._sum.amount ?? 0),
  ]));

  allocations.forEach((allocation) => {
    const invoice = invoiceMap.get(allocation.invoiceId);
    if (!invoice) {
      throw new ValidationError('Tahsis edilen fatura bulunamadi.');
    }
    const existingAmount = existingByInvoiceId.get(allocation.invoiceId) ?? 0;
    const nextAmount = existingAmount + allocation.amount;
    const invoiceTotal = Number(invoice.totalGross);
    if (nextAmount - invoiceTotal > 0.001) {
      throw new ValidationError(`${invoice.number} faturasina tahsis edilen toplam tutar fatura toplamini asamaz.`);
    }
  });
}
