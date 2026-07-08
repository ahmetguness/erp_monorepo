import {
  BankTransactionRefType,
  InvoiceStatus,
  PaymentStatus,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';
import { NotFoundError, ValidationError } from '../errors';

export type BankTransactionMatchTargetType = 'PAYMENT' | 'INVOICE' | 'CONTACT';
export type BankTransactionMatchStrength = 'HIGH' | 'MEDIUM' | 'LOW';

export interface BankTransactionMatchSuggestion {
  refType: BankTransactionMatchTargetType;
  refId: string;
  label: string;
  detail: string;
  amount: number | null;
  date: string | null;
  confidenceScore: number;
  strength: BankTransactionMatchStrength;
  reasons: string[];
}

export interface BankTransactionMatchSuggestionsResult {
  transactionId: string;
  isMatched: boolean;
  currentMatch: {
    refType: string;
    refId: string;
  } | null;
  suggestions: BankTransactionMatchSuggestion[];
}

export interface ApproveBankTransactionMatchInput {
  refType: BankTransactionMatchTargetType;
  refId: string;
}

interface ScoreInput {
  amountScore: number;
  dateScore: number;
  referenceScore: number;
  contactScore: number;
  accountScore: number;
}

function daysBetween(a: Date, b: Date): number {
  const millisPerDay = 24 * 60 * 60 * 1000;
  return Math.abs(Math.round((a.getTime() - b.getTime()) / millisPerDay));
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

function includesNormalized(source: string | null | undefined, target: string | null | undefined): boolean {
  const normalizedSource = normalizeText(source);
  const normalizedTarget = normalizeText(target);
  return Boolean(normalizedSource && normalizedTarget && normalizedSource.includes(normalizedTarget));
}

function numberAmount(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function amountScore(transactionAmount: number, candidateAmount: number | null): number {
  if (candidateAmount === null) return 0;
  const diff = Math.abs(transactionAmount - candidateAmount);
  if (diff <= 0.01) return 42;
  if (diff <= Math.max(1, transactionAmount * 0.01)) return 30;
  if (diff <= Math.max(5, transactionAmount * 0.05)) return 16;
  return 0;
}

function dateScore(transactionDate: Date, candidateDate: Date | null): number {
  if (!candidateDate) return 0;
  const diff = daysBetween(transactionDate, candidateDate);
  if (diff === 0) return 22;
  if (diff <= 2) return 16;
  if (diff <= 7) return 8;
  return 0;
}

function confidence(input: ScoreInput): number {
  return Math.min(100, input.amountScore + input.dateScore + input.referenceScore + input.contactScore + input.accountScore);
}

function strength(score: number): BankTransactionMatchStrength {
  if (score >= 75) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  return 'LOW';
}

function candidateReasons(input: ScoreInput): string[] {
  const reasons: string[] = [];
  if (input.amountScore >= 30) reasons.push('Tutar guclu eslesiyor.');
  else if (input.amountScore > 0) reasons.push('Tutar yakin gorunuyor.');
  if (input.dateScore >= 16) reasons.push('Tarih ayni veya cok yakin.');
  else if (input.dateScore > 0) reasons.push('Tarih kabul edilebilir aralikta.');
  if (input.referenceScore > 0) reasons.push('Referans/aciklama eslesmesi var.');
  if (input.contactScore > 0) reasons.push('Cari bilgisi aciklamada yakalandi.');
  if (input.accountScore > 0) reasons.push('Banka hesabi uyumlu.');
  return reasons.length > 0 ? reasons : ['Dusuk guvenli olasi eslesme.'];
}

function toIsoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function dateWindow(date: Date, days: number): { gte: Date; lte: Date } {
  const gte = new Date(date);
  gte.setDate(gte.getDate() - days);
  const lte = new Date(date);
  lte.setDate(lte.getDate() + days);
  return { gte, lte };
}

export class BankTransactionMatchingService {
  constructor(private readonly db: PrismaClient) {}

  async suggest(tenantId: string, transactionId: string): Promise<BankTransactionMatchSuggestionsResult> {
    const transaction = await this.db.bankTransaction.findFirst({
      where: { id: transactionId, tenantId },
    });
    if (!transaction) throw new NotFoundError('Banka hareketi', transactionId);

    const amount = Number(transaction.amount);
    const description = `${transaction.description ?? ''} ${transaction.reference ?? ''}`;
    const dateRange = dateWindow(transaction.date, 10);
    const alreadyMatched = await this.db.bankTransaction.findMany({
      where: { tenantId, refId: { not: null } },
      select: { refType: true, refId: true },
    });

    const matchedPaymentIds = alreadyMatched
      .filter((match) => match.refType === BankTransactionRefType.PAYMENT && match.refId)
      .map((match) => String(match.refId));
    const matchedInvoiceIds = alreadyMatched
      .filter((match) => match.refType === BankTransactionRefType.INVOICE && match.refId)
      .map((match) => String(match.refId));

    const [payments, invoices, contacts] = await this.db.$transaction([
      this.db.payment.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [PaymentStatus.COMPLETED, PaymentStatus.PENDING] },
          amount: { gte: amount * 0.95, lte: amount * 1.05 },
          date: dateRange,
          ...(matchedPaymentIds.length > 0 ? { id: { notIn: matchedPaymentIds } } : {}),
        },
        include: {
          contact: { select: { id: true, name: true } },
          allocations: { include: { invoice: { select: { id: true, number: true } } } },
        },
        orderBy: { date: 'desc' },
        take: 10,
      }),
      this.db.invoice.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
          totalGross: { gte: amount * 0.95, lte: amount * 1.05 },
          ...(matchedInvoiceIds.length > 0 ? { id: { notIn: matchedInvoiceIds } } : {}),
        },
        include: { contact: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
        take: 10,
      }),
      this.db.contact.findMany({
        where: {
          tenantId,
          deletedAt: null,
          isActive: true,
        },
        select: { id: true, name: true, code: true, taxNumber: true },
        orderBy: { name: 'asc' },
        take: 100,
      }),
    ]);

    const suggestions: BankTransactionMatchSuggestion[] = [];

    for (const payment of payments) {
      const invoiceNumbers = payment.allocations.map((allocation) => allocation.invoice.number).join(' ');
      const scoreInput: ScoreInput = {
        amountScore: amountScore(amount, numberAmount(payment.amount)),
        dateScore: dateScore(transaction.date, payment.date),
        referenceScore: includesNormalized(description, payment.reference) || includesNormalized(description, invoiceNumbers) ? 18 : 0,
        contactScore: includesNormalized(description, payment.contact?.name) ? 12 : 0,
        accountScore: payment.bankAccountId === transaction.bankAccountId ? 6 : 0,
      };
      const score = confidence(scoreInput);
      if (score < 35) continue;
      suggestions.push({
        refType: 'PAYMENT',
        refId: payment.id,
        label: payment.contact?.name ? `Odeme - ${payment.contact.name}` : 'Odeme',
        detail: payment.reference ?? (invoiceNumbers || 'Odeme kaydi'),
        amount: numberAmount(payment.amount),
        date: toIsoDate(payment.date),
        confidenceScore: score,
        strength: strength(score),
        reasons: candidateReasons(scoreInput),
      });
    }

    for (const invoice of invoices) {
      const scoreInput: ScoreInput = {
        amountScore: amountScore(amount, numberAmount(invoice.totalGross)),
        dateScore: dateScore(transaction.date, invoice.dueDate ?? invoice.date),
        referenceScore: includesNormalized(description, invoice.number) ? 20 : 0,
        contactScore: includesNormalized(description, invoice.contact?.name) ? 12 : 0,
        accountScore: 0,
      };
      const score = confidence(scoreInput);
      if (score < 35) continue;
      suggestions.push({
        refType: 'INVOICE',
        refId: invoice.id,
        label: `Fatura - ${invoice.number}`,
        detail: invoice.contact?.name ?? 'Cari bilgisi yok',
        amount: numberAmount(invoice.totalGross),
        date: toIsoDate(invoice.dueDate ?? invoice.date),
        confidenceScore: score,
        strength: strength(score),
        reasons: candidateReasons(scoreInput),
      });
    }

    for (const contact of contacts) {
      const nameMatches = includesNormalized(description, contact.name);
      const codeMatches = includesNormalized(description, contact.code);
      const taxMatches = includesNormalized(description, contact.taxNumber);
      if (!nameMatches && !codeMatches && !taxMatches) continue;
      const scoreInput: ScoreInput = {
        amountScore: 0,
        dateScore: 0,
        referenceScore: codeMatches || taxMatches ? 28 : 0,
        contactScore: nameMatches ? 32 : 0,
        accountScore: 0,
      };
      const score = confidence(scoreInput);
      suggestions.push({
        refType: 'CONTACT',
        refId: contact.id,
        label: `Cari - ${contact.name}`,
        detail: contact.taxNumber ?? contact.code ?? 'Cari hesap',
        amount: null,
        date: null,
        confidenceScore: score,
        strength: strength(score),
        reasons: candidateReasons(scoreInput),
      });
    }

    const sortedSuggestions = suggestions
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, 8);

    return {
      transactionId: transaction.id,
      isMatched: Boolean(transaction.refType && transaction.refId),
      currentMatch: transaction.refType && transaction.refId
        ? { refType: transaction.refType, refId: transaction.refId }
        : null,
      suggestions: sortedSuggestions,
    };
  }

  async approve(tenantId: string, transactionId: string, input: ApproveBankTransactionMatchInput) {
    const transaction = await this.db.bankTransaction.findFirst({
      where: { id: transactionId, tenantId },
    });
    if (!transaction) throw new NotFoundError('Banka hareketi', transactionId);

    const storedRefType = this.toStoredRefType(input.refType);
    await this.assertTargetExists(tenantId, input);

    return this.db.bankTransaction.update({
      where: { id: transaction.id },
      data: {
        refType: storedRefType,
        refId: input.refId,
      },
      include: {
        bankAccount: { select: { id: true, name: true, bankName: true } },
      },
    });
  }

  private toStoredRefType(refType: BankTransactionMatchTargetType): BankTransactionRefType {
    switch (refType) {
      case 'PAYMENT':
        return BankTransactionRefType.PAYMENT;
      case 'INVOICE':
        return BankTransactionRefType.INVOICE;
      case 'CONTACT':
        return BankTransactionRefType.OTHER;
      default:
        throw new ValidationError('Gecersiz eslestirme tipi.');
    }
  }

  private async assertTargetExists(tenantId: string, input: ApproveBankTransactionMatchInput): Promise<void> {
    if (input.refType === 'PAYMENT') {
      const payment = await this.db.payment.findFirst({
        where: { id: input.refId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!payment) throw new NotFoundError('Odeme', input.refId);
      return;
    }

    if (input.refType === 'INVOICE') {
      const invoice = await this.db.invoice.findFirst({
        where: { id: input.refId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!invoice) throw new NotFoundError('Fatura', input.refId);
      return;
    }

    const contact = await this.db.contact.findFirst({
      where: { id: input.refId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!contact) throw new NotFoundError('Cari', input.refId);
  }
}
