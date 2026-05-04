import { Context } from 'hono';
import { CheckNoteType, CheckStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';
import { requireTenantId } from '../utils/context.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface CheckPromissoryListQuery {
  page?: string;
  limit?: string;
  type?: CheckNoteType;
  status?: CheckStatus;
  contactId?: string;
}

interface CreateCheckPromissoryDTO {
  contactId?: string;
  type: CheckNoteType;
  number: string;
  amount: number;
  currencyCode?: string;
  issueDate: string;
  dueDate: string;
  bankName?: string;
  notes?: string;
}

interface UpdateCheckStatusDTO {
  status: CheckStatus;
}

// ─────────────────────────────────────────────
// Check / Promissory Note Controller
// ─────────────────────────────────────────────

export const CheckPromissoryController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as CheckPromissoryListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      deletedAt: null,
      ...(query.type && { type: query.type }),
      ...(query.status && { status: query.status }),
      ...(query.contactId && { contactId: query.contactId }),
    };

    const [total, notes] = await prisma.$transaction([
      prisma.checkPromissoryNote.count({ where }),
      prisma.checkPromissoryNote.findMany({
        where,
        orderBy: { dueDate: 'asc' },
        skip,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: notes,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<CreateCheckPromissoryDTO>();

    if (!body.type || !body.number || !body.amount || !body.issueDate || !body.dueDate) {
      return c.json(
        new ValidationError('type, number, amount, issueDate ve dueDate zorunludur.').toJSON(),
        400,
      );
    }

    if (body.amount <= 0) {
      return c.json(new ValidationError('Tutar 0\'dan büyük olmalıdır.').toJSON(), 400);
    }

    const note = await prisma.checkPromissoryNote.create({
      data: {
        tenantId,
        contactId: body.contactId ?? null,
        type: body.type,
        number: body.number,
        amount: body.amount,
        currencyCode: body.currencyCode ?? 'TRY',
        issueDate: new Date(body.issueDate),
        dueDate: new Date(body.dueDate),
        bankName: body.bankName ?? null,
        notes: body.notes ?? null,
      },
    });

    return c.json({ data: note }, 201);
  },

  async updateStatus(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const existing = await prisma.checkPromissoryNote.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) return c.json(new NotFoundError('Çek/Senet', id).toJSON(), 404);

    const body = await c.req.json<UpdateCheckStatusDTO>();

    if (!body.status) {
      return c.json(new ValidationError('status alanı zorunludur.').toJSON(), 400);
    }

    const validTransitions: Record<CheckStatus, CheckStatus[]> = {
      [CheckStatus.PENDING]: [CheckStatus.DEPOSITED, CheckStatus.CANCELLED],
      [CheckStatus.DEPOSITED]: [CheckStatus.CLEARED, CheckStatus.BOUNCED],
      [CheckStatus.CLEARED]: [],
      [CheckStatus.BOUNCED]: [],
      [CheckStatus.CANCELLED]: [],
    };

    const allowed = validTransitions[existing.status];
    if (!allowed.includes(body.status)) {
      return c.json(
        new ValidationError(
          `${existing.status} durumundan ${body.status} durumuna geçiş yapılamaz.`,
        ).toJSON(),
        400,
      );
    }

    const updated = await prisma.checkPromissoryNote.update({
      where: { id },
      data: { status: body.status },
    });

    return c.json({ data: updated });
  },

  async update(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const existing = await prisma.checkPromissoryNote.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) return c.json(new NotFoundError('Çek/Senet', id).toJSON(), 404);

    if (existing.status !== CheckStatus.PENDING) {
      return c.json(new ValidationError('Sadece bekleyen çek/senetler düzenlenebilir.').toJSON(), 400);
    }

    const body = await c.req.json<Partial<CreateCheckPromissoryDTO>>();

    const updated = await prisma.checkPromissoryNote.update({
      where: { id },
      data: {
        ...(body.contactId !== undefined && { contactId: body.contactId }),
        ...(body.amount !== undefined && { amount: body.amount }),
        ...(body.dueDate !== undefined && { dueDate: new Date(body.dueDate) }),
        ...(body.bankName !== undefined && { bankName: body.bankName }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });

    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const existing = await prisma.checkPromissoryNote.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) return c.json(new NotFoundError('Çek/Senet', id).toJSON(), 404);

    if (existing.status !== CheckStatus.PENDING) {
      return c.json(new ValidationError('Sadece bekleyen çek/senetler silinebilir.').toJSON(), 400);
    }

    await prisma.checkPromissoryNote.update({ where: { id }, data: { deletedAt: new Date() } });
    return c.json({ data: { success: true } });
  },
};
