import { Context } from 'hono';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface CreateBankAccountDTO {
  name: string;
  accountNumber?: string;
  iban?: string;
  bankName?: string;
  currencyCode?: string;
}

interface CreateCashAccountDTO {
  name: string;
  currencyCode?: string;
}

interface CreatePaymentDTO {
  contactId?: string;
  bankAccountId?: string;
  cashAccountId?: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  /** Fatura tahsisatları */
  allocations?: Array<{ invoiceId: string; amount: number }>;
}

interface PaymentListQuery {
  page?: string;
  limit?: string;
  contactId?: string;
  status?: PaymentStatus;
  dateFrom?: string;
  dateTo?: string;
}

// ─────────────────────────────────────────────
// Payment Controller
// BankAccount, CashAccount, Payment, PaymentAllocation
// ─────────────────────────────────────────────

export const PaymentController = {
  // ── Bank Accounts ────────────────────────────

  async listBankAccounts(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const accounts = await prisma.bankAccount.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    });

    return c.json({ data: accounts });
  },

  async createBankAccount(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const body = await c.req.json<CreateBankAccountDTO>();

    if (!body.name) {
      return c.json(new ValidationError('name alanı zorunludur.').toJSON(), 400);
    }

    const account = await prisma.bankAccount.create({
      data: {
        tenantId,
        name: body.name,
        accountNumber: body.accountNumber ?? null,
        iban: body.iban ?? null,
        bankName: body.bankName ?? null,
        currencyCode: body.currencyCode ?? 'TRY',
      },
    });

    return c.json({ data: account }, 201);
  },

  // ── Cash Accounts ────────────────────────────

  async listCashAccounts(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const accounts = await prisma.cashAccount.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    });

    return c.json({ data: accounts });
  },

  async createCashAccount(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const body = await c.req.json<CreateCashAccountDTO>();

    if (!body.name) {
      return c.json(new ValidationError('name alanı zorunludur.').toJSON(), 400);
    }

    const account = await prisma.cashAccount.create({
      data: {
        tenantId,
        name: body.name,
        currencyCode: body.currencyCode ?? 'TRY',
      },
    });

    return c.json({ data: account }, 201);
  },

  // ── Payments ─────────────────────────────────

  async listPayments(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const query = c.req.query() as PaymentListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));

    const where = {
      tenantId,
      deletedAt: null,
      ...(query.contactId && { contactId: query.contactId }),
      ...(query.status && { status: query.status }),
      ...(query.dateFrom || query.dateTo
        ? {
            date: {
              ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
              ...(query.dateTo && { lte: new Date(query.dateTo) }),
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
            include: { invoice: { select: { id: true, number: true } } },
          },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: payments,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async createPayment(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const body = await c.req.json<CreatePaymentDTO>();

    if (!body.date || !body.amount || !body.method) {
      return c.json(new ValidationError('date, amount ve method alanları zorunludur.').toJSON(), 400);
    }

    if (body.amount <= 0) {
      return c.json(new ValidationError('Tutar 0\'dan büyük olmalıdır.').toJSON(), 400);
    }

    // Tahsisat toplamı ödeme tutarını aşmamalı
    if (body.allocations?.length) {
      const allocTotal = body.allocations.reduce((s, a) => s + a.amount, 0);
      if (allocTotal > body.amount) {
        return c.json(
          new ValidationError(
            `Tahsisat toplamı (${allocTotal}) ödeme tutarını (${body.amount}) aşamaz.`,
          ).toJSON(),
          400,
        );
      }
    }

    const payment = await prisma.$transaction(async (tx) => {
      const newPayment = await tx.payment.create({
        data: {
          tenantId,
          contactId: body.contactId ?? null,
          bankAccountId: body.bankAccountId ?? null,
          cashAccountId: body.cashAccountId ?? null,
          date: new Date(body.date),
          amount: body.amount,
          method: body.method,
          reference: body.reference ?? null,
          notes: body.notes ?? null,
          status: PaymentStatus.COMPLETED,
        },
      });

      if (body.allocations?.length) {
        await tx.paymentAllocation.createMany({
          data: body.allocations.map((a) => ({
            tenantId,
            paymentId: newPayment.id,
            invoiceId: a.invoiceId,
            amount: a.amount,
          })),
        });
      }

      return newPayment;
    });

    return c.json({ data: payment }, 201);
  },

  async getPaymentById(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const paymentId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

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

    if (!payment) return c.json(new NotFoundError('Ödeme', paymentId).toJSON(), 404);
    return c.json({ data: payment });
  },
};
