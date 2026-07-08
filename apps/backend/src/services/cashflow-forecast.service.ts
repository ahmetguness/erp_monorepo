import {
  BankTransactionType,
  CheckStatus,
  InvoiceStatus,
  InvoiceType,
  PaymentStatus,
  type PrismaClient,
} from '@prisma/client';

export interface CashflowForecastBreakdown {
  invoices: number;
  checks: number;
  total: number;
}

export interface CashflowForecastPeriod {
  label: string;
  range: string;
  startDay: number;
  endDay: number;
  inflow: CashflowForecastBreakdown;
  outflow: Omit<CashflowForecastBreakdown, 'checks'>;
  netFlow: number;
  endingBalance: number;
}

export interface CashflowDueBucket {
  label: string;
  range: string;
  receivables: number;
  payables: number;
  checks: number;
  total: number;
}

export interface CashflowScenario {
  key: 'conservative' | 'expected' | 'optimistic';
  label: string;
  collectionRatePct: number;
  paymentRatePct: number;
  projectedEndingBalance: number;
  netFlow: number;
}

export interface CashflowForecast {
  startingBalance: number;
  projectedEndingBalance: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  periods: CashflowForecastPeriod[];
  dueBuckets: CashflowDueBucket[];
  scenarios: CashflowScenario[];
}

interface MutablePeriod {
  label: string;
  range: string;
  startDay: number;
  endDay: number;
  invoicesIn: number;
  checksIn: number;
  invoicesOut: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function daysFromToday(date: Date, today: Date): number {
  return Math.ceil((date.getTime() - today.getTime()) / MS_PER_DAY);
}

function createPeriods(): MutablePeriod[] {
  return [
    { label: '30 Gunluk Tahmin', range: '0 - 30 Gun', startDay: 0, endDay: 30, invoicesIn: 0, checksIn: 0, invoicesOut: 0 },
    { label: '60 Gunluk Tahmin', range: '31 - 60 Gun', startDay: 31, endDay: 60, invoicesIn: 0, checksIn: 0, invoicesOut: 0 },
    { label: '90 Gunluk Tahmin', range: '61 - 90 Gun', startDay: 61, endDay: 90, invoicesIn: 0, checksIn: 0, invoicesOut: 0 },
  ];
}

function createDueBuckets(): CashflowDueBucket[] {
  return [
    { label: 'Gecikmis', range: '< 0 Gun', receivables: 0, payables: 0, checks: 0, total: 0 },
    { label: '0-30 Gun', range: '0 - 30 Gun', receivables: 0, payables: 0, checks: 0, total: 0 },
    { label: '31-60 Gun', range: '31 - 60 Gun', receivables: 0, payables: 0, checks: 0, total: 0 },
    { label: '61-90 Gun', range: '61 - 90 Gun', receivables: 0, payables: 0, checks: 0, total: 0 },
  ];
}

function periodIndexForDate(date: Date, today: Date): number | null {
  const diffDays = daysFromToday(date, today);
  if (diffDays < 0) return 0;
  if (diffDays <= 30) return 0;
  if (diffDays <= 60) return 1;
  if (diffDays <= 90) return 2;
  return null;
}

function dueBucketIndexForDate(date: Date, today: Date): number | null {
  const diffDays = daysFromToday(date, today);
  if (diffDays < 0) return 0;
  if (diffDays <= 30) return 1;
  if (diffDays <= 60) return 2;
  if (diffDays <= 90) return 3;
  return null;
}

function scenarioEndingBalance(
  startingBalance: number,
  periods: readonly MutablePeriod[],
  collectionRate: number,
  paymentRate: number,
): Pick<CashflowScenario, 'projectedEndingBalance' | 'netFlow'> {
  const netFlow = periods.reduce((sum, period) => {
    const inflow = (period.invoicesIn + period.checksIn) * collectionRate;
    const outflow = period.invoicesOut * paymentRate;
    return sum + inflow - outflow;
  }, 0);

  return {
    netFlow: roundMoney(netFlow),
    projectedEndingBalance: roundMoney(startingBalance + netFlow),
  };
}

function riskLevelFromBalance(balance: number): CashflowForecast['riskLevel'] {
  if (balance < 0) return 'HIGH';
  if (balance < 50_000) return 'MEDIUM';
  return 'LOW';
}

export async function getCashflowForecast(db: PrismaClient, tenantId: string): Promise<CashflowForecast> {
  const [bankTransactions, cashPayments, openInvoices, checks] = await db.$transaction([
    db.bankTransaction.findMany({ where: { tenantId } }),
    db.payment.findMany({
      where: {
        tenantId,
        cashAccountId: { not: null },
        status: PaymentStatus.COMPLETED,
        deletedAt: null,
      },
    }),
    db.invoice.findMany({
      where: {
        tenantId,
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
        deletedAt: null,
      },
      include: { payments: true },
    }),
    db.checkPromissoryNote.findMany({
      where: {
        tenantId,
        status: { in: [CheckStatus.PENDING, CheckStatus.DEPOSITED] },
        deletedAt: null,
      },
    }),
  ]);

  const bankBalance = bankTransactions.reduce((sum, transaction) => {
    const amount = Number(transaction.amount);
    return transaction.type === BankTransactionType.DEPOSIT ? sum + amount : sum - amount;
  }, 0);

  const cashBalance = cashPayments.reduce((sum, payment) => {
    const amount = Number(payment.amount);
    return payment.direction === 'RECEIVE' ? sum + amount : sum - amount;
  }, 0);

  const startingBalance = roundMoney(bankBalance + cashBalance);
  const today = startOfToday();
  const periodsData = createPeriods();
  const dueBuckets = createDueBuckets();

  for (const invoice of openInvoices) {
    const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const remaining = Number(invoice.totalGross) - paid;
    if (remaining <= 0) continue;

    const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : new Date(invoice.date);
    const periodIndex = periodIndexForDate(dueDate, today);
    const bucketIndex = dueBucketIndexForDate(dueDate, today);
    const isInflow = invoice.type === InvoiceType.SALES || invoice.type === InvoiceType.RETURN_PURCHASE;

    if (periodIndex !== null) {
      if (isInflow) {
        periodsData[periodIndex].invoicesIn += remaining;
      } else {
        periodsData[periodIndex].invoicesOut += remaining;
      }
    }

    if (bucketIndex !== null) {
      if (isInflow) {
        dueBuckets[bucketIndex].receivables += remaining;
      } else {
        dueBuckets[bucketIndex].payables += remaining;
      }
    }
  }

  for (const check of checks) {
    const amount = Number(check.amount);
    const dueDate = new Date(check.dueDate);
    const periodIndex = periodIndexForDate(dueDate, today);
    const bucketIndex = dueBucketIndexForDate(dueDate, today);

    if (periodIndex !== null) {
      periodsData[periodIndex].checksIn += amount;
    }
    if (bucketIndex !== null) {
      dueBuckets[bucketIndex].checks += amount;
    }
  }

  let currentBalance = startingBalance;
  const periods = periodsData.map((period): CashflowForecastPeriod => {
    const totalInflow = period.invoicesIn + period.checksIn;
    const totalOutflow = period.invoicesOut;
    const netFlow = totalInflow - totalOutflow;
    currentBalance += netFlow;

    return {
      label: period.label,
      range: period.range,
      startDay: period.startDay,
      endDay: period.endDay,
      inflow: {
        invoices: roundMoney(period.invoicesIn),
        checks: roundMoney(period.checksIn),
        total: roundMoney(totalInflow),
      },
      outflow: {
        invoices: roundMoney(period.invoicesOut),
        total: roundMoney(totalOutflow),
      },
      netFlow: roundMoney(netFlow),
      endingBalance: roundMoney(currentBalance),
    };
  });

  const scenarios: CashflowScenario[] = [
    { key: 'conservative', label: 'Tedbirli', collectionRatePct: 70, paymentRatePct: 100, ...scenarioEndingBalance(startingBalance, periodsData, 0.7, 1) },
    { key: 'expected', label: 'Beklenen', collectionRatePct: 90, paymentRatePct: 100, ...scenarioEndingBalance(startingBalance, periodsData, 0.9, 1) },
    { key: 'optimistic', label: 'Iyimser', collectionRatePct: 100, paymentRatePct: 90, ...scenarioEndingBalance(startingBalance, periodsData, 1, 0.9) },
  ];

  const normalizedDueBuckets = dueBuckets.map((bucket) => {
    const total = bucket.receivables + bucket.checks - bucket.payables;
    return {
      ...bucket,
      receivables: roundMoney(bucket.receivables),
      payables: roundMoney(bucket.payables),
      checks: roundMoney(bucket.checks),
      total: roundMoney(total),
    };
  });

  const projectedEndingBalance = periods.at(-1)?.endingBalance ?? startingBalance;

  return {
    startingBalance,
    projectedEndingBalance,
    riskLevel: riskLevelFromBalance(projectedEndingBalance),
    periods,
    dueBuckets: normalizedDueBuckets,
    scenarios,
  };
}
