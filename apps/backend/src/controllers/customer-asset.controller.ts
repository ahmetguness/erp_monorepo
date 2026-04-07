import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

// ─────────────────────────────────────────────
// Customer Asset Controller — Müşteri varlıkları CRUD
// ─────────────────────────────────────────────

export const CustomerAssetController = {
  async list(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)));
    const contactId = c.req.query('contactId');

    const where = { tenantId, deletedAt: null, ...(contactId && { contactId }) };

    const [total, data] = await prisma.$transaction([
      prisma.customerAsset.count({ where }),
      prisma.customerAsset.findMany({
        where,
        include: {
          contact: { select: { id: true, name: true, code: true } },
          _count: { select: { serviceRequests: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return c.json({ data, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const asset = await prisma.customerAsset.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        contact: { select: { id: true, name: true, code: true, phone: true, email: true } },
        serviceRequests: {
          where: { deletedAt: null },
          select: { id: true, number: true, subject: true, status: true, priority: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!asset) return c.json(new NotFoundError('Müşteri Varlığı', id).toJSON(), 404);
    return c.json({ data: asset });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const body = await c.req.json<{
      contactId: string; name: string; brand?: string; model?: string;
      serialNo?: string; purchaseDate?: string; warrantyEnd?: string; notes?: string;
    }>();
    if (!body.contactId || !body.name) return c.json(new ValidationError('contactId ve name zorunludur.').toJSON(), 400);

    const asset = await prisma.customerAsset.create({
      data: {
        tenantId, contactId: body.contactId, name: body.name,
        brand: body.brand ?? null, model: body.model ?? null,
        serialNo: body.serialNo ?? null, notes: body.notes ?? null,
        purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : null,
        warrantyEnd: body.warrantyEnd ? new Date(body.warrantyEnd) : null,
      },
      include: { contact: { select: { id: true, name: true } } },
    });
    return c.json({ data: asset }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const existing = await prisma.customerAsset.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return c.json(new NotFoundError('Müşteri Varlığı', id).toJSON(), 404);

    const body = await c.req.json<{
      name?: string; brand?: string; model?: string; serialNo?: string;
      purchaseDate?: string; warrantyEnd?: string; notes?: string; isActive?: boolean;
    }>();

    const updated = await prisma.customerAsset.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.brand !== undefined && { brand: body.brand }),
        ...(body.model !== undefined && { model: body.model }),
        ...(body.serialNo !== undefined && { serialNo: body.serialNo }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.purchaseDate !== undefined && { purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : null }),
        ...(body.warrantyEnd !== undefined && { warrantyEnd: body.warrantyEnd ? new Date(body.warrantyEnd) : null }),
      },
    });
    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const existing = await prisma.customerAsset.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return c.json(new NotFoundError('Müşteri Varlığı', id).toJSON(), 404);

    await prisma.customerAsset.update({ where: { id }, data: { deletedAt: new Date() } });
    return c.json({ data: { success: true } });
  },
};
