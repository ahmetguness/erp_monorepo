import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { requireTenantId } from '../utils/context.js';
import { getRequestMeta } from '../utils/audit.js';
import {
  createPayment,
  getPaymentById,
  listPayments,
  parseCreatePaymentInput,
  type CreatePaymentInput,
  type ListPaymentsInput,
} from '../services/payment.service.js';

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

type CreatePaymentDTO = CreatePaymentInput;
type PaymentListQuery = ListPaymentsInput;
// ─────────────────────────────────────────────
// Payment Controller
// BankAccount, CashAccount, Payment, PaymentAllocation
// ─────────────────────────────────────────────

export const PaymentController = {
  // ── Bank Accounts ────────────────────────────

  async listBankAccounts(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const accounts = await prisma.bankAccount.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    });

    return c.json({ data: accounts });
  },

  async createBankAccount(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

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

  async updateBankAccount(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const existing = await prisma.bankAccount.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return c.json(new NotFoundError('Banka hesabı', id).toJSON(), 404);

    const body = await c.req.json<Partial<CreateBankAccountDTO> & { isActive?: boolean }>();

    const updated = await prisma.bankAccount.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.accountNumber !== undefined && { accountNumber: body.accountNumber }),
        ...(body.iban !== undefined && { iban: body.iban }),
        ...(body.bankName !== undefined && { bankName: body.bankName }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return c.json({ data: updated });
  },

  async deleteBankAccount(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const existing = await prisma.bankAccount.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return c.json(new NotFoundError('Banka hesabı', id).toJSON(), 404);

    await prisma.bankAccount.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    return c.json({ data: { success: true } });
  },

  // ── Cash Accounts ────────────────────────────

  async listCashAccounts(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const accounts = await prisma.cashAccount.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    });

    return c.json({ data: accounts });
  },

  async createCashAccount(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

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

  async updateCashAccount(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const existing = await prisma.cashAccount.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return c.json(new NotFoundError('Kasa hesabı', id).toJSON(), 404);

    const body = await c.req.json<{ name?: string; isActive?: boolean }>();

    const updated = await prisma.cashAccount.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return c.json({ data: updated });
  },

  async deleteCashAccount(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const existing = await prisma.cashAccount.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return c.json(new NotFoundError('Kasa hesabı', id).toJSON(), 404);

    await prisma.cashAccount.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    return c.json({ data: { success: true } });
  },

  // ── Payments ─────────────────────────────────

  async listPayments(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const query: PaymentListQuery = {
      page: c.req.query('page'),
      limit: c.req.query('limit'),
      contactId: c.req.query('contactId'),
      status: c.req.query('status'),
      dateFrom: c.req.query('dateFrom'),
      dateTo: c.req.query('dateTo'),
    };

    return c.json(await listPayments(tenantId, query));
  },

  async createPayment(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.get('userId') as string | undefined;
    const { ipAddress, userAgent } = getRequestMeta(c);
    const body: CreatePaymentDTO = parseCreatePaymentInput(await c.req.json());

    const payment = await createPayment({
      tenantId,
      userId,
      input: body,
      auditMeta: { ipAddress, userAgent },
    });

    return c.json({ data: payment }, 201);
  },

  async getPaymentById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const paymentId = c.req.param('id');
    if (!paymentId) throw new ValidationError('id alani zorunludur.');

    return c.json({ data: await getPaymentById(tenantId, paymentId) });
  },
};
