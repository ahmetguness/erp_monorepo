import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { getPaginationParams } from '../utils/pagination.js';
import { requireTenantId, requireParam } from '../utils/context.js';
import { getProductionEngineering } from '../services/production-engineering.service.js';

// ─────────────────────────────────────────────
// BOM Controller — Ürün ağacı CRUD
// ─────────────────────────────────────────────

export const BOMController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 50);

    const [total, data] = await prisma.$transaction([
      prisma.bOM.count({ where: { tenantId } }),
      prisma.bOM.findMany({
        where: { tenantId },
        include: {
          product: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true, routings: true, workOrders: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: skip,
        take: limit,
      }),
    ]);

    return c.json({ data, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

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

  async engineering(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const data = await getProductionEngineering(prisma, tenantId, id);
    if (!data) return c.json(new NotFoundError('BOM', id).toJSON(), 404);

    return c.json({ data });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{
      productId: string; name: string; version?: string; effectiveFrom?: string; effectiveTo?: string;
      items?: Array<{ productId: string; quantity: number; unit?: string; notes?: string }>;
    }>();

    if (!body.productId || !body.name) return c.json(new ValidationError('productId ve name zorunludur.').toJSON(), 400);

    const bom = await prisma.bOM.create({
      data: {
        tenantId, productId: body.productId, name: body.name, version: body.version ?? '1.0', effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : null, effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
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
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.bOM.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('BOM', id).toJSON(), 404);

    const body = await c.req.json<{ name?: string; version?: string; isActive?: boolean; effectiveFrom?: string | null; effectiveTo?: string | null }>();
    const updated = await prisma.bOM.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.version !== undefined && { version: body.version }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        effectiveFrom: body.effectiveFrom === null ? null : (body.effectiveFrom !== undefined ? new Date(body.effectiveFrom) : undefined),
        effectiveTo: body.effectiveTo === null ? null : (body.effectiveTo !== undefined ? new Date(body.effectiveTo) : undefined),
      },
    });
    return c.json({ data: updated });
  },

  // ─── BOM Items ──────────────────────────────

  async addItem(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const bomId = requireParam(c, 'id');

    const bom = await prisma.bOM.findFirst({ where: { id: bomId, tenantId } });
    if (!bom) return c.json(new NotFoundError('BOM', bomId).toJSON(), 404);

    const body = await c.req.json<{ productId: string; quantity: number; unit?: string; notes?: string }>();
    if (!body.productId || !body.quantity) return c.json(new ValidationError('productId ve quantity zorunludur.').toJSON(), 400);

    const maxSort = await prisma.bOMItem.aggregate({ where: { tenantId, bomId }, _max: { sortOrder: true } });
    const item = await prisma.bOMItem.create({
      data: { tenantId, bomId, productId: body.productId, quantity: body.quantity, unit: body.unit ?? null, notes: body.notes ?? null, sortOrder: (maxSort._max.sortOrder ?? -1) + 1 },
      include: { product: { select: { id: true, code: true, name: true } } },
    });
    return c.json({ data: item }, 201);
  },

  async removeItem(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const itemId = requireParam(c, 'itemId');

    const item = await prisma.bOMItem.findFirst({ where: { id: itemId, tenantId } });
    if (!item) return c.json(new NotFoundError('BOM Kalemi', itemId).toJSON(), 404);

    await prisma.bOMItem.delete({ where: { id: itemId } });
    return c.json({ data: { success: true } });
  },

  // ─── Routing Operations ─────────────────────

  async addRouting(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const bomId = requireParam(c, 'id');

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
    const tenantId = requireTenantId(c);
    const routingId = requireParam(c, 'routingId');

    const routing = await prisma.routingOperation.findFirst({ where: { id: routingId, tenantId } });
    if (!routing) return c.json(new NotFoundError('Routing', routingId).toJSON(), 404);

    await prisma.routingOperation.delete({ where: { id: routingId } });
    return c.json({ data: { success: true } });
  },
};
