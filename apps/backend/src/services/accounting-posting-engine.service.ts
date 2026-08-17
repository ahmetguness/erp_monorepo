import { InvoiceStatus, InvoiceType, JournalEntryType, PaymentStatus, type Prisma, type PrismaClient } from '@prisma/client';
import { createEventContext, domainEvents } from '../domain-events/index.js';
import { generateDocumentNumber } from '../utils/generate-number.js';
import { resolveOpenFiscalPeriodId } from './financial/index.js';

type PostingDbClient = PrismaClient | Prisma.TransactionClient;
type PostingSource = 'ALL' | 'INVOICE' | 'PAYMENT' | 'STOCK';
type PostingStatus = 'POSTED' | 'SKIPPED' | 'FAILED';

type PostingRole =
  | 'CUSTOMER_RECEIVABLE'
  | 'SUPPLIER_PAYABLE'
  | 'SALES_REVENUE'
  | 'VAT_PAYABLE'
  | 'PURCHASE_INVENTORY'
  | 'VAT_RECEIVABLE'
  | 'BANK'
  | 'CASH';

interface PostingLineDraft {
  role: PostingRole;
  debit: number;
  credit: number;
  description: string;
}

export interface PostingEngineRunOptions {
  source: PostingSource;
  limit: number;
  postImmediately: boolean;
  userId?: string | null;
}

export interface PostingEngineItemResult {
  source: Exclude<PostingSource, 'ALL'>;
  refType: string;
  refId: string;
  refNumber: string;
  status: PostingStatus;
  journalEntryId: string | null;
  message: string;
}

export interface PostingEngineMappingStatus {
  role: PostingRole;
  code: string;
  accountId: string | null;
  accountName: string | null;
  available: boolean;
}

export interface PostingEngineRunResult {
  generatedAt: string;
  source: PostingSource;
  scanned: number;
  posted: number;
  skipped: number;
  failed: number;
  mappings: PostingEngineMappingStatus[];
  items: PostingEngineItemResult[];
}

const ROLE_DEFAULT_CODES: Record<PostingRole, string> = {
  CUSTOMER_RECEIVABLE: '120',
  SUPPLIER_PAYABLE: '320',
  SALES_REVENUE: '600',
  VAT_PAYABLE: '391',
  PURCHASE_INVENTORY: '153',
  VAT_RECEIVABLE: '191',
  BANK: '102',
  CASH: '100',
};

function numberValue(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeSource(value: string | undefined): PostingSource {
  if (value === 'INVOICE' || value === 'PAYMENT' || value === 'STOCK') return value;
  return 'ALL';
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 50;
  return Math.min(200, Math.max(1, Math.trunc(value)));
}

function isInvoiceDebitNormal(type: InvoiceType): boolean {
  return type === InvoiceType.SALES || type === InvoiceType.RETURN_PURCHASE;
}

function isPurchaseInvoice(type: InvoiceType): boolean {
  return type === InvoiceType.PURCHASE || type === InvoiceType.RETURN_PURCHASE;
}

export function parsePostingEngineOptions(input: Record<string, unknown>, userId?: string | null): PostingEngineRunOptions {
  const source = typeof input.source === 'string' ? normalizeSource(input.source) : 'ALL';
  const limit = normalizeLimit(typeof input.limit === 'number' ? input.limit : undefined);
  const postImmediately = typeof input.postImmediately === 'boolean' ? input.postImmediately : true;
  return { source, limit, postImmediately, userId };
}

export class AccountingPostingEngineService {
  constructor(private readonly db: PostingDbClient) {}

  async run(tenantId: string, options: PostingEngineRunOptions): Promise<PostingEngineRunResult> {
    const mappings = await this.resolveMappings(tenantId);
    const items: PostingEngineItemResult[] = [];

    if (options.source === 'ALL' || options.source === 'INVOICE') {
      const invoices = await this.findInvoiceCandidates(tenantId, options.limit);
      for (const invoice of invoices) {
        items.push(await this.postInvoice(tenantId, invoice, mappings, options));
      }
    }

    if (options.source === 'ALL' || options.source === 'PAYMENT') {
      const payments = await this.findPaymentCandidates(tenantId, options.limit);
      for (const payment of payments) {
        items.push(await this.postPayment(tenantId, payment, mappings, options));
      }
    }

    if (options.source === 'ALL' || options.source === 'STOCK') {
      const stockCount = await this.db.stockMovement.count({ where: { tenantId } });
      if (stockCount > 0) {
        items.push({
          source: 'STOCK',
          refType: 'STOCK_MOVEMENT',
          refId: 'stock',
          refNumber: 'Stok hareketleri',
          status: 'SKIPPED',
          journalEntryId: null,
          message: 'Stok posting için JournalEntryType enumunda AUTO_STOCK bulunmadığından güvenli şekilde atlandı.',
        });
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      source: options.source,
      scanned: items.length,
      posted: items.filter((item) => item.status === 'POSTED').length,
      skipped: items.filter((item) => item.status === 'SKIPPED').length,
      failed: items.filter((item) => item.status === 'FAILED').length,
      mappings: this.toMappingStatus(mappings),
      items,
    };
  }

  private async resolveMappings(tenantId: string): Promise<Map<PostingRole, { id: string; name: string; code: string }>> {
    const accounts = await this.db.ledgerAccount.findMany({
      where: { tenantId, isActive: true, deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });

    const mappings = new Map<PostingRole, { id: string; name: string; code: string }>();
    for (const [role, code] of Object.entries(ROLE_DEFAULT_CODES) as Array<[PostingRole, string]>) {
      const account = accounts.find((item) => item.code === code) ?? accounts.find((item) => item.code.startsWith(code));
      if (account) mappings.set(role, account);
    }
    return mappings;
  }

  private toMappingStatus(mappings: Map<PostingRole, { id: string; name: string; code: string }>): PostingEngineMappingStatus[] {
    return (Object.entries(ROLE_DEFAULT_CODES) as Array<[PostingRole, string]>).map(([role, code]) => {
      const account = mappings.get(role);
      return {
        role,
        code,
        accountId: account?.id ?? null,
        accountName: account?.name ?? null,
        available: Boolean(account),
      };
    });
  }

  private async findInvoiceCandidates(tenantId: string, limit: number) {
    const existing = await this.db.journalEntry.findMany({
      where: { tenantId, refType: 'INVOICE' },
      select: { refId: true },
    });
    const postedIds = existing.map((entry) => entry.refId).filter((id): id is string => Boolean(id));
    return this.db.invoice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { not: InvoiceStatus.CANCELLED },
        id: { notIn: postedIds },
      },
      include: { lines: true },
      orderBy: { date: 'asc' },
      take: limit,
    });
  }

  private async findPaymentCandidates(tenantId: string, limit: number) {
    const existing = await this.db.journalEntry.findMany({
      where: { tenantId, refType: 'PAYMENT' },
      select: { refId: true },
    });
    const postedIds = existing.map((entry) => entry.refId).filter((id): id is string => Boolean(id));
    return this.db.payment.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: PaymentStatus.COMPLETED,
        id: { notIn: postedIds },
      },
      orderBy: { date: 'asc' },
      take: limit,
    });
  }

  private async postInvoice(
    tenantId: string,
    invoice: Prisma.InvoiceGetPayload<{ include: { lines: true } }>,
    mappings: Map<PostingRole, { id: string; name: string; code: string }>,
    options: PostingEngineRunOptions,
  ): Promise<PostingEngineItemResult> {
    const lines = this.invoiceLines(invoice);
    return this.createJournalEntry(tenantId, {
      source: 'INVOICE',
      refType: 'INVOICE',
      refId: invoice.id,
      refNumber: invoice.number,
      date: invoice.date,
      type: JournalEntryType.AUTO_INVOICE,
      description: `Otomatik fatura muhasebe kaydı: ${invoice.number}`,
      lines,
      mappings,
      options,
    });
  }

  private invoiceLines(invoice: Prisma.InvoiceGetPayload<{ include: { lines: true } }>): PostingLineDraft[] {
    const net = numberValue(invoice.totalNet);
    const tax = numberValue(invoice.totalTax);
    const gross = numberValue(invoice.totalGross);
    const debitNormal = isInvoiceDebitNormal(invoice.type);
    const purchase = isPurchaseInvoice(invoice.type);

    if (purchase) {
      const inventoryDebit = debitNormal ? 0 : net;
      const vatDebit = debitNormal ? 0 : tax;
      const payableCredit = debitNormal ? 0 : gross;
      const payableDebit = debitNormal ? gross : 0;
      const inventoryCredit = debitNormal ? net : 0;
      const vatCredit = debitNormal ? tax : 0;
      const lines: PostingLineDraft[] = [
        { role: 'PURCHASE_INVENTORY', debit: inventoryDebit, credit: inventoryCredit, description: 'Satın alma stok/masraf' },
        { role: 'VAT_RECEIVABLE', debit: vatDebit, credit: vatCredit, description: 'İndirilecek KDV' },
        { role: 'SUPPLIER_PAYABLE', debit: payableDebit, credit: payableCredit, description: 'Tedarikçi borcu' },
      ];
      return lines.filter((line) => line.debit > 0 || line.credit > 0);
    }

    const receivableDebit = debitNormal ? gross : 0;
    const receivableCredit = debitNormal ? 0 : gross;
    const revenueCredit = debitNormal ? net : 0;
    const revenueDebit = debitNormal ? 0 : net;
    const vatCredit = debitNormal ? tax : 0;
    const vatDebit = debitNormal ? 0 : tax;
    const lines: PostingLineDraft[] = [
      { role: 'CUSTOMER_RECEIVABLE', debit: receivableDebit, credit: receivableCredit, description: 'Müşteri alacağı' },
      { role: 'SALES_REVENUE', debit: revenueDebit, credit: revenueCredit, description: 'Satış geliri' },
      { role: 'VAT_PAYABLE', debit: vatDebit, credit: vatCredit, description: 'Hesaplanan KDV' },
    ];
    return lines.filter((line) => line.debit > 0 || line.credit > 0);
  }

  private async postPayment(
    tenantId: string,
    payment: Prisma.PaymentGetPayload<object>,
    mappings: Map<PostingRole, { id: string; name: string; code: string }>,
    options: PostingEngineRunOptions,
  ): Promise<PostingEngineItemResult> {
    if (!payment.contactId) {
      return {
        source: 'PAYMENT',
        refType: 'PAYMENT',
        refId: payment.id,
        refNumber: payment.reference ?? payment.id,
        status: 'SKIPPED',
        journalEntryId: null,
        message: 'Cari bağlantısı olmayan ödeme atlandı.',
      };
    }

    const amount = numberValue(payment.amount);
    const cashRole: PostingRole = payment.cashAccountId ? 'CASH' : 'BANK';
    const contactRole: PostingRole = payment.direction === 'SEND' ? 'SUPPLIER_PAYABLE' : 'CUSTOMER_RECEIVABLE';
    const lines: PostingLineDraft[] = payment.direction === 'SEND'
      ? [
          { role: contactRole, debit: amount, credit: 0, description: 'Tedarikçi ödemesi' },
          { role: cashRole, debit: 0, credit: amount, description: 'Ödeme çıkışı' },
        ]
      : [
          { role: cashRole, debit: amount, credit: 0, description: 'Tahsilat girişi' },
          { role: contactRole, debit: 0, credit: amount, description: 'Müşteri tahsilatı' },
        ];

    return this.createJournalEntry(tenantId, {
      source: 'PAYMENT',
      refType: 'PAYMENT',
      refId: payment.id,
      refNumber: payment.reference ?? payment.id,
      date: payment.date,
      type: JournalEntryType.AUTO_PAYMENT,
      description: `Otomatik ödeme muhasebe kaydı: ${payment.reference ?? payment.id}`,
      lines,
      mappings,
      options,
    });
  }

  private async createJournalEntry(
    tenantId: string,
    params: {
      source: Exclude<PostingSource, 'ALL'>;
      refType: string;
      refId: string;
      refNumber: string;
      date: Date;
      type: JournalEntryType;
      description: string;
      lines: PostingLineDraft[];
      mappings: Map<PostingRole, { id: string; name: string; code: string }>;
      options: PostingEngineRunOptions;
    },
  ): Promise<PostingEngineItemResult> {
    const missingRole = params.lines.find((line) => !params.mappings.has(line.role))?.role;
    if (missingRole) {
      await this.publishPostingFailed(tenantId, params.refType, params.refId, `${missingRole} için hesap planı mapping'i bulunamadı.`, params.options.userId);
      return {
        source: params.source,
        refType: params.refType,
        refId: params.refId,
        refNumber: params.refNumber,
        status: 'SKIPPED',
        journalEntryId: null,
        message: `${missingRole} için hesap planı mapping'i bulunamadı.`,
      };
    }

    const debit = roundMoney(params.lines.reduce((sum, line) => sum + line.debit, 0));
    const credit = roundMoney(params.lines.reduce((sum, line) => sum + line.credit, 0));
    if (Math.abs(debit - credit) > 0.01) {
      await this.publishPostingFailed(tenantId, params.refType, params.refId, `Fiş dengeli değil. Borç ${debit}, alacak ${credit}.`, params.options.userId);
      return {
        source: params.source,
        refType: params.refType,
        refId: params.refId,
        refNumber: params.refNumber,
        status: 'FAILED',
        journalEntryId: null,
        message: `Fiş dengeli değil. Borç ${debit}, alacak ${credit}.`,
      };
    }

    try {
      const fiscalPeriodId = await resolveOpenFiscalPeriodId(this.db, tenantId, params.date, 'Otomatik muhasebe fişi');
      const number = await generateDocumentNumber(tenantId, 'journal', 'JE-', 'journalEntry');
      const entry = await this.db.journalEntry.create({
        data: {
          tenantId,
          fiscalPeriodId,
          type: params.type,
          number,
          date: params.date,
          description: params.description,
          refType: params.refType,
          refId: params.refId,
          isPosted: params.options.postImmediately,
          postedAt: params.options.postImmediately ? new Date() : null,
          postedById: params.options.postImmediately ? params.options.userId ?? null : null,
          createdById: params.options.userId ?? null,
          lines: {
            create: params.lines.map((line, index) => {
              const account = params.mappings.get(line.role);
              if (!account) throw new Error(`${line.role} mapping'i bulunamadı.`);
              return {
                tenantId,
                accountId: account.id,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
                sortOrder: index,
              };
            }),
          },
        },
        select: { id: true },
      });

      await domainEvents.publish({
        name: 'accounting.entry.created',
        context: createEventContext({ tenantId, userId: params.options.userId ?? null }),
        payload: {
          journalEntryId: entry.id,
          number,
          refType: params.refType,
          refId: params.refId,
          totalDebit: debit,
          totalCredit: credit,
        },
      });

      return {
        source: params.source,
        refType: params.refType,
        refId: params.refId,
        refNumber: params.refNumber,
        status: 'POSTED',
        journalEntryId: entry.id,
        message: params.options.postImmediately ? 'Otomatik fiş oluşturuldu ve onaylandı.' : 'Otomatik fiş taslak oluşturuldu.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bilinmeyen posting hatası.';
      await this.publishPostingFailed(tenantId, params.refType, params.refId, message, params.options.userId);
      return {
        source: params.source,
        refType: params.refType,
        refId: params.refId,
        refNumber: params.refNumber,
        status: 'FAILED',
        journalEntryId: null,
        message,
      };
    }
  }

  private async publishPostingFailed(
    tenantId: string,
    refType: string,
    refId: string,
    reason: string,
    userId?: string | null,
  ): Promise<void> {
    await domainEvents.publish({
      name: 'accounting.entry.failed',
      context: createEventContext({ tenantId, userId: userId ?? null }),
      payload: { refType, refId, reason },
    });
  }
}
