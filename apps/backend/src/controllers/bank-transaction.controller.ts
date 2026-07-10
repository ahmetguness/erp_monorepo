import { Context } from 'hono';
import { BankTransactionType, BankTransactionRefType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { requireTenantId, requireParam } from '../utils/context.js';
import {
  BankTransactionMatchingService,
} from '../services/bank-transaction-matching.service';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface BankTransactionListQuery {
  page?: string;
  limit?: string;
  bankAccountId?: string;
  type?: BankTransactionType;
  dateFrom?: string;
  dateTo?: string;
}

interface CreateBankTransactionDTO {
  bankAccountId: string;
  type: BankTransactionType;
  amount: number;
  balanceAfter: number;
  date: string;
  description?: string;
  reference?: string;
}

interface MatchPaymentDTO {
  refType: string;
  refId: string;
}

interface BulkApproveMatchesDTO {
  transactionIds?: string[];
  minConfidence?: number;
}

function readMatchTargetType(value: string): 'PAYMENT' | 'INVOICE' | 'CONTACT' {
  if (value === 'PAYMENT' || value === 'INVOICE' || value === 'CONTACT') return value;
  throw new ValidationError('Gecersiz eslestirme tipi.');
}

function readStoredRefType(value: string): BankTransactionRefType | null {
  switch (value) {
    case BankTransactionRefType.PAYMENT:
      return BankTransactionRefType.PAYMENT;
    case BankTransactionRefType.INVOICE:
      return BankTransactionRefType.INVOICE;
    case BankTransactionRefType.RECONCILIATION:
      return BankTransactionRefType.RECONCILIATION;
    case BankTransactionRefType.OTHER:
      return BankTransactionRefType.OTHER;
    default:
      return null;
  }
}

const matchingService = new BankTransactionMatchingService(prisma);

// ─────────────────────────────────────────────
// Bank Transaction Controller
// ─────────────────────────────────────────────

export const BankTransactionController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as BankTransactionListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      ...(query.bankAccountId && { bankAccountId: query.bankAccountId }),
      ...(query.type && { type: query.type }),
      ...(query.dateFrom || query.dateTo
        ? {
            date: {
              ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
              ...(query.dateTo && { lte: new Date(query.dateTo) }),
            },
          }
        : {}),
    };

    const [total, transactions] = await prisma.$transaction([
      prisma.bankTransaction.count({ where }),
      prisma.bankTransaction.findMany({
        where,
        include: {
          bankAccount: { select: { id: true, name: true, bankName: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: transactions,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<CreateBankTransactionDTO>();

    if (!body.bankAccountId || !body.type || body.amount === undefined || body.balanceAfter === undefined || !body.date) {
      return c.json(
        new ValidationError('bankAccountId, type, amount, balanceAfter ve date zorunludur.').toJSON(),
        400,
      );
    }

    const bankAccount = await prisma.bankAccount.findFirst({
      where: { id: body.bankAccountId, tenantId, deletedAt: null },
    });
    if (!bankAccount) return c.json(new NotFoundError('Banka hesabı', body.bankAccountId).toJSON(), 404);

    const transaction = await prisma.bankTransaction.create({
      data: {
        tenantId,
        bankAccountId: body.bankAccountId,
        type: body.type,
        amount: body.amount,
        balanceAfter: body.balanceAfter,
        date: new Date(body.date),
        description: body.description ?? null,
        reference: body.reference ?? null,
      },
      include: {
        bankAccount: { select: { id: true, name: true } },
      },
    });

    return c.json({ data: transaction }, 201);
  },

  async matchPayment(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.bankTransaction.findFirst({
      where: { id, tenantId },
    });
    if (!existing) return c.json(new NotFoundError('Banka hareketi', id).toJSON(), 404);

    const body = await c.req.json<MatchPaymentDTO>();

    if (!body.refType || !body.refId) {
      return c.json(new ValidationError('refType ve refId zorunludur.').toJSON(), 400);
    }

    const storedRefType = readStoredRefType(body.refType);
    if (storedRefType === BankTransactionRefType.RECONCILIATION || storedRefType === BankTransactionRefType.OTHER) {
      const updated = await prisma.bankTransaction.update({
        where: { id },
        data: {
          refType: storedRefType,
          refId: body.refId,
        },
        include: {
          bankAccount: { select: { id: true, name: true, bankName: true } },
        },
      });

      return c.json({ data: updated });
    }

    const updated = await matchingService.approve(tenantId, id, {
      refType: readMatchTargetType(body.refType),
      refId: body.refId,
    });

    return c.json({ data: updated });
  },

  async suggestions(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');
    const result = await matchingService.suggest(tenantId, id);
    return c.json({ data: result });
  },

  async matchingWorkbench(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const result = await matchingService.workbench(tenantId);
    return c.json({ data: result });
  },

  async bulkApproveMatches(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = await c.req.json<BulkApproveMatchesDTO>();
    if (!Array.isArray(body.transactionIds) || !body.transactionIds.every((id) => typeof id === 'string')) {
      return c.json(new ValidationError('transactionIds metin listesi olmalidir.').toJSON(), 400);
    }
    if (body.minConfidence !== undefined && (typeof body.minConfidence !== 'number' || body.minConfidence < 0 || body.minConfidence > 100)) {
      return c.json(new ValidationError('minConfidence 0-100 arasinda sayi olmalidir.').toJSON(), 400);
    }

    const result = await matchingService.bulkApprove(tenantId, {
      transactionIds: body.transactionIds,
      minConfidence: body.minConfidence,
    });
    return c.json({ data: result });
  },

  async approveMatch(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');
    const body = await c.req.json<MatchPaymentDTO>();

    if (!body.refType || !body.refId) {
      return c.json(new ValidationError('refType ve refId zorunludur.').toJSON(), 400);
    }

    const updated = await matchingService.approve(tenantId, id, {
      refType: readMatchTargetType(body.refType),
      refId: body.refId,
    });

    return c.json({ data: updated });
  },
};
