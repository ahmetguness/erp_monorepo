import { PaymentStatus, PrismaClient } from '@prisma/client';

export type AccountingClosingChecklistItemKey =
  | 'journal_entries'
  | 'reconciliations'
  | 'open_payments'
  | 'stock_valuation';

export type AccountingClosingChecklistStatus = 'PASS' | 'WARN' | 'FAIL';

export interface AccountingClosingChecklistItem {
  key: AccountingClosingChecklistItemKey;
  label: string;
  description: string;
  status: AccountingClosingChecklistStatus;
  count: number;
  blocking: boolean;
  actionLabel: string;
  href: string;
}

export interface AccountingClosingChecklistSummary {
  total: number;
  passed: number;
  warnings: number;
  blockers: number;
  canClose: boolean;
}

export interface AccountingClosingChecklist {
  period: {
    id: string;
    name: string;
    startDate: Date;
    endDate: Date;
    status: string;
  };
  summary: AccountingClosingChecklistSummary;
  items: AccountingClosingChecklistItem[];
  generatedAt: Date;
}

function startOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function endOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(23, 59, 59, 999);
  return normalized;
}

function summarize(items: AccountingClosingChecklistItem[]): AccountingClosingChecklistSummary {
  const blockers = items.filter((item) => item.status === 'FAIL' && item.blocking).length;
  return {
    total: items.length,
    passed: items.filter((item) => item.status === 'PASS').length,
    warnings: items.filter((item) => item.status === 'WARN').length,
    blockers,
    canClose: blockers === 0,
  };
}

export async function getAccountingClosingChecklist(
  db: PrismaClient,
  tenantId: string,
  periodId: string,
): Promise<AccountingClosingChecklist | null> {
  const period = await db.fiscalPeriod.findFirst({
    where: { id: periodId, tenantId },
    select: { id: true, name: true, startDate: true, endDate: true, status: true },
  });

  if (!period) return null;

  const dateRange = {
    gte: startOfDay(period.startDate),
    lte: endOfDay(period.endDate),
  };

  const [draftJournalEntries, reconciliationCount, unfinalizedReconciliationCount, openPaymentTotals, stockValuationTotals] =
    await db.$transaction([
      db.journalEntry.count({
        where: {
          tenantId,
          isPosted: false,
          OR: [{ fiscalPeriodId: period.id }, { date: dateRange }],
        },
      }),
      db.reconciliation.count({
        where: { tenantId, date: dateRange },
      }),
      db.reconciliation.count({
        where: { tenantId, date: dateRange, isFinalized: false },
      }),
      db.payment.aggregate({
        where: {
          tenantId,
          deletedAt: null,
          date: dateRange,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      db.stockValuation.aggregate({
        where: { tenantId, date: dateRange },
        _count: { _all: true },
        _sum: { totalValue: true },
      }),
    ]);

  const openPaymentCount = openPaymentTotals._count._all;
  const openPaymentAmount = Number(openPaymentTotals._sum.amount ?? 0);
  const stockValuationCount = stockValuationTotals._count._all;
  const stockValuationAmount = Number(stockValuationTotals._sum.totalValue ?? 0);

  const items: AccountingClosingChecklistItem[] = [
    {
      key: 'journal_entries',
      label: 'Eksik fiş kontrolü',
      description:
        draftJournalEntries > 0
          ? `${draftJournalEntries} onaylanmamış yevmiye fişi var.`
          : 'Dönemde onay bekleyen yevmiye fişi yok.',
      status: draftJournalEntries > 0 ? 'FAIL' : 'PASS',
      count: draftJournalEntries,
      blocking: draftJournalEntries > 0,
      actionLabel: 'Fişlere git',
      href: '/dashboard/accounting/journal-entries',
    },
    {
      key: 'reconciliations',
      label: 'Mutabakat kontrolü',
      description:
        reconciliationCount === 0
          ? 'Bu dönem için mutabakat kaydı bulunamadı.'
          : unfinalizedReconciliationCount > 0
            ? `${unfinalizedReconciliationCount} tamamlanmamış mutabakat var.`
            : `${reconciliationCount} mutabakat tamamlandı.`,
      status: reconciliationCount === 0 ? 'WARN' : unfinalizedReconciliationCount > 0 ? 'FAIL' : 'PASS',
      count: unfinalizedReconciliationCount,
      blocking: unfinalizedReconciliationCount > 0,
      actionLabel: 'Mutabakatlara git',
      href: '/dashboard/reconciliations',
    },
    {
      key: 'open_payments',
      label: 'Açık ödeme kontrolü',
      description:
        openPaymentCount > 0
          ? `${openPaymentCount} açık ödeme var. Toplam: ${openPaymentAmount.toFixed(2)}`
          : 'Dönemde bekleyen veya hatalı ödeme yok.',
      status: openPaymentCount > 0 ? 'FAIL' : 'PASS',
      count: openPaymentCount,
      blocking: openPaymentCount > 0,
      actionLabel: 'Ödemelere git',
      href: '/dashboard/payments',
    },
    {
      key: 'stock_valuation',
      label: 'Stok değerleme kontrolü',
      description:
        stockValuationCount > 0
          ? `${stockValuationCount} stok değerleme kaydı var. Toplam: ${stockValuationAmount.toFixed(2)}`
          : 'Bu dönem için stok değerleme kaydı bulunamadı.',
      status: stockValuationCount > 0 ? 'PASS' : 'WARN',
      count: stockValuationCount,
      blocking: false,
      actionLabel: 'Stok değerlemeye git',
      href: '/dashboard/stock-valuations',
    },
  ];

  return {
    period,
    summary: summarize(items),
    items,
    generatedAt: new Date(),
  };
}
