import { Context } from 'hono';
import { BankTransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

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

// ─────────────────────────────────────────────
// Bank Transaction Controller
// ─────────────────────────────────────────────

export const BankTransactionController = {
  async list(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

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
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

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
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const existing = await prisma.bankTransaction.findFirst({
      where: { id, tenantId },
    });
    if (!existing) return c.json(new NotFoundError('Banka hareketi', id).toJSON(), 404);

    const body = await c.req.json<MatchPaymentDTO>();

    if (!body.refType || !body.refId) {
      return c.json(new ValidationError('refType ve refId zorunludur.').toJSON(), 400);
    }

    const updated = await prisma.bankTransaction.update({
      where: { id },
      data: {
        refType: body.refType,
        refId: body.refId,
      },
    });

    return c.json({ data: updated });
  },
};
