import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { requireTenantId } from '../utils/context.js';
import { assertAccountingPeriodOpen } from '../services/financial-integrity.service';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface ReconciliationListQuery {
  page?: string;
  limit?: string;
  isFinalized?: string;
}

interface CreateReconciliationDTO {
  name: string;
  description?: string;
  date: string;
  lines?: Array<{
    accountId: string;
    refType?: string;
    refId?: string;
    amount: number;
    notes?: string;
  }>;
}

interface AddReconciliationLineDTO {
  accountId: string;
  refType?: string;
  refId?: string;
  amount: number;
  notes?: string;
}

// ─────────────────────────────────────────────
// Reconciliation Controller
// ─────────────────────────────────────────────

export const ReconciliationController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as ReconciliationListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      ...(query.isFinalized !== undefined && { isFinalized: query.isFinalized === 'true' }),
    };

    const [total, reconciliations] = await prisma.$transaction([
      prisma.reconciliation.count({ where }),
      prisma.reconciliation.findMany({
        where,
        include: {
          _count: { select: { lines: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: reconciliations,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const reconciliation = await prisma.reconciliation.findFirst({
      where: { id, tenantId },
      include: {
        lines: {
          include: {
            account: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    if (!reconciliation) return c.json(new NotFoundError('Mutabakat', id).toJSON(), 404);
    return c.json({ data: reconciliation });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<CreateReconciliationDTO>();

    if (!body.name || !body.date) {
      return c.json(new ValidationError('name ve date zorunludur.').toJSON(), 400);
    }

    const reconciliationDate = new Date(body.date);
    await assertAccountingPeriodOpen(prisma, tenantId, reconciliationDate, 'Mutabakat');

    const reconciliation = await prisma.reconciliation.create({
      data: {
        tenantId,
        name: body.name,
        description: body.description ?? null,
        date: reconciliationDate,
        ...(body.lines?.length && {
          lines: {
            create: body.lines.map((line) => ({
              tenantId,
              accountId: line.accountId,
              refType: line.refType ?? null,
              refId: line.refId ?? null,
              amount: line.amount,
              notes: line.notes ?? null,
            })),
          },
        }),
      },
      include: {
        lines: {
          include: { account: { select: { id: true, code: true, name: true } } },
        },
      },
    });

    return c.json({ data: reconciliation }, 201);
  },

  async addLine(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const reconciliation = await prisma.reconciliation.findFirst({
      where: { id, tenantId },
    });
    if (!reconciliation) return c.json(new NotFoundError('Mutabakat', id).toJSON(), 404);

    if (reconciliation.isFinalized) {
      return c.json(new ValidationError('Tamamlanmış mutabakata satır eklenemez.').toJSON(), 400);
    }

    await assertAccountingPeriodOpen(prisma, tenantId, reconciliation.date, 'Mutabakat satiri');

    const body = await c.req.json<AddReconciliationLineDTO>();

    if (!body.accountId || body.amount === undefined) {
      return c.json(new ValidationError('accountId ve amount zorunludur.').toJSON(), 400);
    }

    const line = await prisma.reconciliationLine.create({
      data: {
        tenantId,
        reconciliationId: id,
        accountId: body.accountId,
        refType: body.refType ?? null,
        refId: body.refId ?? null,
        amount: body.amount,
        notes: body.notes ?? null,
      },
      include: {
        account: { select: { id: true, code: true, name: true } },
      },
    });

    return c.json({ data: line }, 201);
  },

  async finalize(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const reconciliation = await prisma.reconciliation.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { lines: true } } },
    });
    if (!reconciliation) return c.json(new NotFoundError('Mutabakat', id).toJSON(), 404);

    if (reconciliation.isFinalized) {
      return c.json(new ValidationError('Mutabakat zaten tamamlanmış.').toJSON(), 400);
    }

    if (reconciliation._count.lines === 0) {
      return c.json(new ValidationError('Satır olmadan mutabakat tamamlanamaz.').toJSON(), 400);
    }

    await assertAccountingPeriodOpen(prisma, tenantId, reconciliation.date, 'Mutabakat tamamlama');

    const updated = await prisma.reconciliation.update({
      where: { id },
      data: { isFinalized: true, finalizedAt: new Date() },
    });

    return c.json({ data: updated });
  },
};
