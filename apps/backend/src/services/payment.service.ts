import { AuditAction, EntityType, InvoiceType, PaymentMethod, PaymentStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ValidationError, NotFoundError } from '../errors';
import { createEventContext, domainEvents } from '../domain-events';
import { createAuditLog } from '../utils/audit.js';
import { writePaymentAccountEntry } from '../utils/account-entry.js';
import {
  assertAccountingPeriodOpen,
  assertPaymentAllocationsWithinInvoiceBalance,
} from './financial-integrity.service';

export type PaymentDirection = 'RECEIVE' | 'SEND';

export interface PaymentAllocationInput {
  invoiceId: string;
  amount: number;
}

export interface CreatePaymentInput {
  contactId?: string;
  bankAccountId?: string;
  cashAccountId?: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  direction?: PaymentDirection;
  reference?: string;
  notes?: string;
  allocations?: PaymentAllocationInput[];
}

export interface ListPaymentsInput {
  page?: string;
  limit?: string;
  contactId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface RequestAuditMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ValidationError(`${key} metin olmalidir.`);
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = readOptionalString(record, key);
  if (!value) throw new ValidationError(`${key} alani zorunludur.`);
  return value;
}

function readRequiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  const numericValue = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(numericValue)) throw new ValidationError(`${key} sayisal olmalidir.`);
  return numericValue;
}

function parsePaymentMethod(value: unknown): PaymentMethod {
  switch (value) {
    case PaymentMethod.CASH:
      return PaymentMethod.CASH;
    case PaymentMethod.BANK_TRANSFER:
      return PaymentMethod.BANK_TRANSFER;
    case PaymentMethod.CREDIT_CARD:
      return PaymentMethod.CREDIT_CARD;
    case PaymentMethod.CHECK:
      return PaymentMethod.CHECK;
    case PaymentMethod.PROMISSORY_NOTE:
      return PaymentMethod.PROMISSORY_NOTE;
    case PaymentMethod.OTHER:
      return PaymentMethod.OTHER;
    default:
      throw new ValidationError('Gecersiz odeme yontemi.');
  }
}

function parsePaymentDirection(value: unknown): PaymentDirection | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'RECEIVE' || value === 'SEND') return value;
  throw new ValidationError('Gecersiz odeme yonu.');
}

function parsePaymentStatus(value: string | undefined): PaymentStatus | undefined {
  if (!value) return undefined;
  switch (value) {
    case PaymentStatus.PENDING:
      return PaymentStatus.PENDING;
    case PaymentStatus.COMPLETED:
      return PaymentStatus.COMPLETED;
    case PaymentStatus.CANCELLED:
      return PaymentStatus.CANCELLED;
    case PaymentStatus.FAILED:
      return PaymentStatus.FAILED;
    case PaymentStatus.REFUNDED:
      return PaymentStatus.REFUNDED;
    default:
      return undefined;
  }
}

function parsePaymentDate(value: string): Date {
  const paymentDate = new Date(value);
  if (Number.isNaN(paymentDate.getTime())) throw new ValidationError('Gecersiz tarih.');
  return paymentDate;
}

function parseAllocations(value: unknown): PaymentAllocationInput[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new ValidationError('Tahsisatlar liste olmalidir.');

  return value.map((item) => {
    if (!isRecord(item)) throw new ValidationError('Tahsisat kaydi gecersiz.');
    return {
      invoiceId: readRequiredString(item, 'invoiceId'),
      amount: readRequiredNumber(item, 'amount'),
    };
  });
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, parsed));
}

function isReceivableInvoice(type: InvoiceType): boolean {
  return type === InvoiceType.SALES || type === InvoiceType.RETURN_PURCHASE;
}

function isPayableInvoice(type: InvoiceType): boolean {
  return type === InvoiceType.PURCHASE || type === InvoiceType.RETURN_SALES;
}

export function parseCreatePaymentInput(value: unknown): CreatePaymentInput {
  if (!isRecord(value)) throw new ValidationError('Gecersiz odeme govdesi.');

  return {
    contactId: readOptionalString(value, 'contactId'),
    bankAccountId: readOptionalString(value, 'bankAccountId'),
    cashAccountId: readOptionalString(value, 'cashAccountId'),
    date: readRequiredString(value, 'date'),
    amount: readRequiredNumber(value, 'amount'),
    method: parsePaymentMethod(value.method),
    direction: parsePaymentDirection(value.direction),
    reference: readOptionalString(value, 'reference'),
    notes: readOptionalString(value, 'notes'),
    allocations: parseAllocations(value.allocations),
  };
}

export async function listPayments(tenantId: string, input: ListPaymentsInput) {
  const page = parsePositiveInt(input.page, 1, 10_000);
  const pageSize = parsePositiveInt(input.limit, 20, 100);
  const status = parsePaymentStatus(input.status);

  const where = {
    tenantId,
    deletedAt: null,
    ...(input.contactId && { contactId: input.contactId }),
    ...(status && { status }),
    ...(input.dateFrom || input.dateTo
      ? {
          date: {
            ...(input.dateFrom && { gte: new Date(input.dateFrom) }),
            ...(input.dateTo && { lte: new Date(input.dateTo) }),
          },
        }
      : {}),
  };

  const [total, payments] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      include: {
        contact: { select: { id: true, name: true } },
        bankAccount: { select: { id: true, name: true } },
        cashAccount: { select: { id: true, name: true } },
        allocations: {
          include: { invoice: { select: { id: true, number: true, totalGross: true } } },
        },
      },
      orderBy: { date: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    data: payments,
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  };
}

export async function getPaymentById(tenantId: string, paymentId: string) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, tenantId, deletedAt: null },
    include: {
      contact: { select: { id: true, name: true } },
      bankAccount: { select: { id: true, name: true } },
      cashAccount: { select: { id: true, name: true } },
      allocations: {
        include: { invoice: { select: { id: true, number: true, totalGross: true } } },
      },
    },
  });

  if (!payment) throw new NotFoundError('Odeme', paymentId);
  return payment;
}

async function validatePaymentRelations(tenantId: string, input: CreatePaymentInput): Promise<void> {
  if (input.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, tenantId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!contact) throw new ValidationError('Secilen cari bulunamadi.');
  }

  if (input.bankAccountId) {
    const bankAccount = await prisma.bankAccount.findFirst({
      where: { id: input.bankAccountId, tenantId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!bankAccount) throw new ValidationError('Secilen banka hesabi bulunamadi.');
  }

  if (input.cashAccountId) {
    const cashAccount = await prisma.cashAccount.findFirst({
      where: { id: input.cashAccountId, tenantId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!cashAccount) throw new ValidationError('Secilen kasa hesabi bulunamadi.');
  }
}

async function validatePaymentAllocations(
  tenantId: string,
  input: CreatePaymentInput,
  amount: number,
  direction: PaymentDirection,
): Promise<void> {
  const allocations = input.allocations ?? [];
  if (allocations.length === 0) return;

  if (!input.contactId) {
    throw new ValidationError('Fatura tahsisati icin cari secimi zorunludur.');
  }

  const invoiceIds = allocations.map((allocation) => allocation.invoiceId);
  const uniqueInvoiceIds = new Set(invoiceIds);
  if (uniqueInvoiceIds.size !== invoiceIds.length) {
    throw new ValidationError('Ayni fatura birden fazla kez tahsis edilemez.');
  }

  if (allocations.some((allocation) => !Number.isFinite(allocation.amount) || allocation.amount <= 0)) {
    throw new ValidationError('Tahsisat tutarlari 0dan buyuk olmalidir.');
  }

  const allocationTotal = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  if (allocationTotal > amount) {
    throw new ValidationError(`Tahsisat toplami (${allocationTotal}) odeme tutarini (${amount}) asamaz.`);
  }

  const invoices = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds }, tenantId, deletedAt: null },
    select: { id: true, contactId: true, type: true },
  });

  if (invoices.length !== uniqueInvoiceIds.size) {
    throw new ValidationError('Secilen faturalardan biri bulunamadi.');
  }

  if (invoices.some((invoice) => invoice.contactId !== input.contactId)) {
    throw new ValidationError('Tahsis edilen fatura secilen cariye ait olmalidir.');
  }

  const hasWrongDirectionInvoice = invoices.some((invoice) =>
    direction === 'RECEIVE' ? !isReceivableInvoice(invoice.type) : !isPayableInvoice(invoice.type),
  );

  if (hasWrongDirectionInvoice) {
    throw new ValidationError('Fatura tipi odeme yonu ile uyumlu degil.');
  }
}

export async function createPayment(options: {
  tenantId: string;
  userId?: string | null;
  input: CreatePaymentInput;
  auditMeta?: RequestAuditMeta;
}) {
  const amount = Number(options.input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError('Tutar 0dan buyuk olmalidir.');
  }

  const direction = options.input.direction ?? 'RECEIVE';
  const paymentDate = parsePaymentDate(options.input.date);

  await validatePaymentRelations(options.tenantId, options.input);
  await validatePaymentAllocations(options.tenantId, options.input, amount, direction);
  await assertAccountingPeriodOpen(prisma, options.tenantId, paymentDate, 'Odeme');

  const payment = await prisma.$transaction(async (tx) => {
    await assertPaymentAllocationsWithinInvoiceBalance(tx, options.tenantId, options.input.allocations ?? []);

    const newPayment = await tx.payment.create({
      data: {
        tenantId: options.tenantId,
        contactId: options.input.contactId ?? null,
        bankAccountId: options.input.bankAccountId ?? null,
        cashAccountId: options.input.cashAccountId ?? null,
        date: paymentDate,
        amount,
        method: options.input.method,
        reference: options.input.reference ?? null,
        notes: options.input.notes ?? null,
        status: PaymentStatus.COMPLETED,
      },
    });

    if (options.input.allocations?.length) {
      await tx.paymentAllocation.createMany({
        data: options.input.allocations.map((allocation) => ({
          tenantId: options.tenantId,
          paymentId: newPayment.id,
          invoiceId: allocation.invoiceId,
          amount: allocation.amount,
        })),
      });
    }

    if (options.input.contactId) {
      await writePaymentAccountEntry(tx, {
        tenantId: options.tenantId,
        contactId: options.input.contactId,
        paymentId: newPayment.id,
        reference: options.input.reference,
        amount,
        date: paymentDate,
        direction,
        userId: options.userId,
      });
    }

    return newPayment;
  });

  await createAuditLog(prisma, {
    tenantId: options.tenantId,
    userId: options.userId,
    module: 'accounting',
    entityType: EntityType.OTHER,
    entityId: payment.id,
    action: AuditAction.CREATE,
    newValues: { amount, method: options.input.method, direction, contactId: options.input.contactId ?? null },
    ipAddress: options.auditMeta?.ipAddress,
    userAgent: options.auditMeta?.userAgent,
  });

  if (direction === 'RECEIVE') {
    await domainEvents.publish({
      name: 'payment.received',
      context: createEventContext({ tenantId: options.tenantId, userId: options.userId }),
      payload: {
        paymentId: payment.id,
        contactId: payment.contactId,
        amount: Number(payment.amount),
        method: payment.method,
        reference: payment.reference,
      },
    });
  }

  return payment;
}
