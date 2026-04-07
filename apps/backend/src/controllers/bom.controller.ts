import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

// ─────────────────────────────────────────────
// BOM Controller — Ürün ağacı CRUD
// ─────────────────────────────────────────────

export const BOMController = {
  async list(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '50', 10)));

    const [total, data] = await prisma.$transaction([
      prisma.bOM.count({ where: { tenantId } }),
      prisma.bOM.findMany({
        where: { tenantId },
        include: {
          product: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true, routings: true, workOrders: true } },
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

    const bom = await prisma.bOM.findFirst({
      where: { id, tenantId },
      include: {
        product: { select: { id: true, code: true, name: true } },
        items: {
          include: { product: { select: { id: true, code: true, name: true } } },
          orderBy: { sortOrder: 'asc' },
        },
        routings: {
          include: { workCenter: { select: { id: true, code: true, name: true } } },
          orderBy: { stepOrder: 'asc' },
        },
      },
    });
    if (!bom) return c.json(new NotFoundError('BOM', id).toJSON(), 404);
    return c.json({ data: bom });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const body = await c.req.json<{
      productId: string; name: string; version?: string;
      items?: Array<{ productId: string; quantity: number; unit?: string; notes?: string }>;
    }>();

    if (!body.productId || !body.name) return c.json(new ValidationError('productId ve name zorunludur.').toJSON(), 400);

    const bom = await prisma.bOM.create({
      data: {
        tenantId, productId: body.productId, name: body.name, version: body.version ?? '1.0',
        ...(body.items?.length && {
          items: {
            create: body.items.map((item, i) => ({
              tenantId, productId: item.productId, quantity: item.quantity,
              unit: item.unit ?? null, notes: item.notes ?? null, sortOrder: i,
            })),
          },
        }),
      },
      include: { product: { select: { id: true, code: true, name: true } }, _count: { select: { items: true } } },
    });
    return c.json({ data: bom }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const existing = await prisma.bOM.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('BOM', id).toJSON(), 404);

    const body = await c.req.json<{ name?: string; version?: string; isActive?: boolean }>();
    const updated = await prisma.bOM.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.version !== undefined && { version: body.version }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
    return c.json({ data: updated });
  },

  // ─── BOM Items ──────────────────────────────

  async addItem(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const bomId = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const bom = await prisma.bOM.findFirst({ where: { id: bomId, tenantId } });
    if (!bom) return c.json(new NotFoundError('BOM', bomId).toJSON(), 404);

    const body = await c.req.json<{ productId: string; quantity: number; unit?: string; notes?: string }>();
    if (!body.productId || !body.quantity) return c.json(new ValidationError('productId ve quantity zorunludur.').toJSON(), 400);

    const maxSort = await prisma.bOMItem.aggregate({ where: { bomId }, _max: { sortOrder: true } });
    const item = await prisma.bOMItem.create({
      data: { tenantId, bomId, productId: body.productId, quantity: body.quantity, unit: body.unit ?? null, notes: body.notes ?? null, sortOrder: (maxSort._max.sortOrder ?? -1) + 1 },
      include: { product: { select: { id: true, code: true, name: true } } },
    });
    return c.json({ data: item }, 201);
  },

  async removeItem(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const itemId = c.req.param('itemId')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const item = await prisma.bOMItem.findFirst({ where: { id: itemId, tenantId } });
    if (!item) return c.json(new NotFoundError('BOM Kalemi', itemId).toJSON(), 404);

    await prisma.bOMItem.delete({ where: { id: itemId } });
    return c.json({ data: { success: true } });
  },

  // ─── Routing Operations ─────────────────────

  async addRouting(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const bomId = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const bom = await prisma.bOM.findFirst({ where: { id: bomId, tenantId } });
    if (!bom) return c.json(new NotFoundError('BOM', bomId).toJSON(), 404);

    const body = await c.req.json<{ workCenterId: string; name: string; stepOrder: number; setupTime?: number; runTime?: number; notes?: string }>();
    if (!body.workCenterId || !body.name || body.stepOrder == null) return c.json(new ValidationError('workCenterId, name ve stepOrder zorunludur.').toJSON(), 400);

    const routing = await prisma.routingOperation.create({
      data: { tenantId, bomId, workCenterId: body.workCenterId, name: body.name, stepOrder: body.stepOrder, setupTime: body.setupTime ?? null, runTime: body.runTime ?? null, notes: body.notes ?? null },
      include: { workCenter: { select: { id: true, code: true, name: true } } },
    });
    return c.json({ data: routing }, 201);
  },

  async removeRouting(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const routingId = c.req.param('routingId')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const routing = await prisma.routingOperation.findFirst({ where: { id: routingId, tenantId } });
    if (!routing) return c.json(new NotFoundError('Routing', routingId).toJSON(), 404);

    await prisma.routingOperation.delete({ where: { id: routingId } });
    return c.json({ data: { success: true } });
  },
};
