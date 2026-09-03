import { InvoiceStatus, type PrismaClient } from '@prisma/client';
import type { FinanceExceptionItem, FinanceOperationsAnalysis, FinanceOperationsPolicy, FinanceOperationsRepository, RecurringFinancePattern } from '../../application/operations/index.js';

const KEYS = {
  enabled: 'finance.operations.auto_process_enabled', confidence: 'finance.operations.auto_match_confidence',
  stale: 'finance.operations.feed_stale_hours', duplicates: 'finance.operations.duplicate_window_days',
} as const;
const DEFAULT_POLICY: FinanceOperationsPolicy = { autoProcessEnabled: false, autoMatchMinConfidence: 95, feedStaleHours: 24, duplicateWindowDays: 14 };

function numeric(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function recurringKey(value: string | null): string {
  return (value ?? '').toLocaleLowerCase('tr-TR').replace(/\d+/g, '#').replace(/[^a-zçğıöşü# ]/gi, ' ').replace(/\s+/g, ' ').trim();
}

export class PrismaFinanceOperationsRepository implements FinanceOperationsRepository {
  constructor(private readonly db: PrismaClient) {}

  async getPolicy(tenantId: string): Promise<FinanceOperationsPolicy> {
    const rows = await this.db.tenantSetting.findMany({ where: { tenantId, key: { in: Object.values(KEYS) } }, select: { key: true, value: true } });
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      autoProcessEnabled: values[KEYS.enabled] === 'true',
      autoMatchMinConfidence: numeric(values[KEYS.confidence], DEFAULT_POLICY.autoMatchMinConfidence),
      feedStaleHours: numeric(values[KEYS.stale], DEFAULT_POLICY.feedStaleHours),
      duplicateWindowDays: numeric(values[KEYS.duplicates], DEFAULT_POLICY.duplicateWindowDays),
    };
  }

  async savePolicy(tenantId: string, policy: FinanceOperationsPolicy): Promise<void> {
    const entries = [[KEYS.enabled, String(policy.autoProcessEnabled)], [KEYS.confidence, String(policy.autoMatchMinConfidence)], [KEYS.stale, String(policy.feedStaleHours)], [KEYS.duplicates, String(policy.duplicateWindowDays)]] as const;
    await this.db.$transaction(entries.map(([key, value]) => this.db.tenantSetting.upsert({ where: { tenantId_key: { tenantId, key } }, create: { tenantId, key, value }, update: { value } })));
  }

  async analyze(tenantId: string, policy: FinanceOperationsPolicy): Promise<FinanceOperationsAnalysis> {
    const recurringSince = new Date();
    recurringSince.setDate(recurringSince.getDate() - 90);
    const duplicateSince = new Date();
    duplicateSince.setDate(duplicateSince.getDate() - policy.duplicateWindowDays);
    const [latest, unmatched, openInvoices, draftInvoices, recentTransactions] = await this.db.$transaction([
      this.db.bankTransaction.findFirst({ where: { tenantId }, orderBy: { date: 'desc' }, select: { date: true } }),
      this.db.bankTransaction.findMany({ where: { tenantId, OR: [{ refType: null }, { refId: null }] }, select: { id: true, amount: true, description: true }, orderBy: { date: 'desc' }, take: 50 }),
      this.db.invoice.findMany({ where: { tenantId, deletedAt: null, status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] } }, select: { id: true, number: true, totalGross: true }, orderBy: { date: 'desc' }, take: 40 }),
      this.db.invoice.findMany({ where: { tenantId, deletedAt: null, status: InvoiceStatus.DRAFT, date: { gte: duplicateSince } }, select: { id: true, number: true, contactId: true, type: true, currencyCode: true, totalGross: true, date: true }, orderBy: { date: 'desc' }, take: 200 }),
      this.db.bankTransaction.findMany({ where: { tenantId, date: { gte: recurringSince } }, select: { id: true, description: true, amount: true }, take: 500 }),
    ]);

    const splitExceptions: FinanceExceptionItem[] = [];
    for (const transaction of unmatched) {
      const amount = Math.abs(Number(transaction.amount));
      let pair: [typeof openInvoices[number], typeof openInvoices[number]] | null = null;
      for (let left = 0; left < openInvoices.length && !pair; left += 1) for (let right = left + 1; right < openInvoices.length; right += 1) {
        const first = openInvoices[left]; const second = openInvoices[right];
        if (first && second && Math.abs(Number(first.totalGross) + Number(second.totalGross) - amount) <= 0.01) { pair = [first, second]; break; }
      }
      if (pair) splitExceptions.push({ id: `split:${transaction.id}`, kind: 'POSSIBLE_SPLIT', title: transaction.description || 'Bölünmüş ödeme adayı', detail: `${pair[0].number} ve ${pair[1].number} faturalarının toplamı hareketle eşleşiyor.`, amount, confidence: 90, href: `/dashboard/bank-transactions?transactionId=${encodeURIComponent(transaction.id)}`, sourceIds: [transaction.id, pair[0].id, pair[1].id] });
    }

    const draftGroups = new Map<string, typeof draftInvoices>();
    for (const invoice of draftInvoices) {
      const key = `${invoice.contactId}:${invoice.type}:${invoice.currencyCode}:${Number(invoice.totalGross).toFixed(2)}`;
      draftGroups.set(key, [...(draftGroups.get(key) ?? []), invoice]);
    }
    const duplicateDrafts: FinanceExceptionItem[] = [...draftGroups.entries()].filter(([, invoices]) => invoices.length > 1).map(([key, invoices]) => ({ id: `duplicate:${key}`, kind: 'DUPLICATE_DRAFT', title: 'Yinelenen fatura taslağı', detail: `${invoices.length} taslak aynı cari, tür ve tutara sahip.`, amount: Number(invoices[0]?.totalGross ?? 0), confidence: 100, href: '/dashboard/invoices?status=DRAFT', sourceIds: invoices.map((invoice) => invoice.id) }));

    const recurringGroups = new Map<string, { description: string; amounts: number[] }>();
    for (const transaction of recentTransactions) {
      const key = recurringKey(transaction.description);
      if (key.length < 4) continue;
      const group = recurringGroups.get(key) ?? { description: transaction.description ?? key, amounts: [] };
      group.amounts.push(Math.abs(Number(transaction.amount)));
      recurringGroups.set(key, group);
    }
    const recurringPatterns: RecurringFinancePattern[] = [...recurringGroups.entries()].filter(([, group]) => group.amounts.length >= 3).map(([key, group]) => ({ key, description: group.description, occurrences: group.amounts.length, averageAmount: group.amounts.reduce((sum, amount) => sum + amount, 0) / group.amounts.length, suggestedAction: 'LEARN_DESCRIPTION' as const })).slice(0, 20);
    return { lastTransactionAt: latest?.date ?? null, splitExceptions, duplicateDrafts, recurringPatterns };
  }
}
