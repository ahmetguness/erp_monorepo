import { Context } from 'hono';
import { Prisma } from '@prisma/client';
import { ConflictError,NotFoundError,ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { getProductionEngineering } from '../../infrastructure/services/production-engineering.service.js';
import { requireParam,requireTenantId } from '../../../../utils/context.js';
import { getPaginationParams } from '../../../../utils/pagination.js';

const MAX_QUANTITY = 999_999_999_999_999.999;

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${field} zorunludur.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new ValidationError(`${field} en fazla ${maxLength} karakter olabilir.`);
  return trimmed;
}

function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ValidationError(`${field} metin olmalıdır.`);
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError(`${field} boş olamaz.`);
  if (trimmed.length > maxLength) throw new ValidationError(`${field} en fazla ${maxLength} karakter olabilir.`);
  return trimmed;
}

function positiveNumber(value: unknown, field: string, max = MAX_QUANTITY): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max) {
    throw new ValidationError(`${field} 0'dan büyük ve geçerli bir sayı olmalıdır.`);
  }
  return value;
}

function nonNegativeNumber(value: unknown, field: string, max = 99_999_999.99): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
    throw new ValidationError(`${field} negatif olmayan geçerli bir sayı olmalıdır.`);
  }
  return value;
}

function optionalDate(value: unknown, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) throw new ValidationError(`${field} geçerli bir tarih olmalıdır.`);
  return new Date(value);
}

async function assertNoBomCycle(tenantId: string, parentProductId: string, componentProductIds: string[]): Promise<void> {
  if (componentProductIds.includes(parentProductId)) throw new ValidationError('Bir ürün kendi BOM malzemesi olamaz.');
  const boms = await prisma.bOM.findMany({
    where: { tenantId },
    select: { productId: true, items: { select: { productId: true } } },
  });
  const graph = new Map<string, Set<string>>();
  for (const bom of boms) {
    const edges = graph.get(bom.productId) ?? new Set<string>();
    for (const item of bom.items) edges.add(item.productId);
    graph.set(bom.productId, edges);
  }
  const newEdges = graph.get(parentProductId) ?? new Set<string>();
  for (const componentId of componentProductIds) newEdges.add(componentId);
  graph.set(parentProductId, newEdges);
  const reachesParent = (current: string, visited: Set<string>): boolean => {
    if (current === parentProductId) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    return [...(graph.get(current) ?? [])].some((next) => reachesParent(next, visited));
  };
  if (componentProductIds.some((componentId) => reachesParent(componentId, new Set()))) {
    throw new ConflictError('BOM malzemeleri döngüsel ürün ağacı oluşturamaz.');
  }
}

// ─────────────────────────────────────────────
// BOM Controller — Ürün ağacı CRUD
// ─────────────────────────────────────────────

export const BOMController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 50);
    const search = c.req.query('search')?.trim();
    const status = c.req.query('status');
    if (status && !['active', 'passive'].includes(status)) return c.json(new ValidationError('Geçersiz BOM durum filtresi.').toJSON(), 400);
    const where = {
      tenantId,
      ...(status ? { isActive: status === 'active' } : {}),
      ...(search ? { OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { version: { contains: search, mode: 'insensitive' as const } },
        { product: { name: { contains: search, mode: 'insensitive' as const } } },
        { product: { code: { contains: search, mode: 'insensitive' as const } } },
      ] } : {}),
    };

    const [total, data] = await prisma.$transaction([
      prisma.bOM.count({ where }),
      prisma.bOM.findMany({
        where,
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

    let name: string;
    let version: string;
    try {
      name = requiredText(body.name, 'name', 200);
      version = body.version === undefined ? '1.0' : requiredText(body.version, 'version', 50);
    } catch (error) {
      if (error instanceof ValidationError) return c.json(error.toJSON(), 400);
      throw error;
    }
    if (typeof body.productId !== 'string' || !body.productId) return c.json(new ValidationError('productId zorunludur.').toJSON(), 400);
    const effectiveFrom = optionalDate(body.effectiveFrom, 'effectiveFrom');
    const effectiveTo = optionalDate(body.effectiveTo, 'effectiveTo');
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) return c.json(new ValidationError('effectiveTo, effectiveFrom tarihinden önce olamaz.').toJSON(), 400);
    const itemProductIds = body.items?.map((item) => item.productId) ?? [];
    if (new Set(itemProductIds).size !== itemProductIds.length) return c.json(new ConflictError('Aynı ürün BOM içinde birden fazla kez kullanılamaz.').toJSON(), 409);
    try {
      for (const item of body.items ?? []) {
        if (typeof item.productId !== 'string' || !item.productId) throw new ValidationError('Kalem productId zorunludur.');
        positiveNumber(item.quantity, 'quantity');
        if (item.unit !== undefined) optionalText(item.unit, 'unit', 50);
        if (item.notes !== undefined) optionalText(item.notes, 'notes', 2000);
      }
    } catch (error) {
      if (error instanceof ValidationError) return c.json(error.toJSON(), 400);
      throw error;
    }
    const products = await prisma.product.findMany({ where: { id: { in: [body.productId, ...itemProductIds] }, tenantId, deletedAt: null }, select: { id: true } });
    if (products.length !== new Set([body.productId, ...itemProductIds]).size) return c.json(new NotFoundError('Ürün').toJSON(), 404);
    try { await assertNoBomCycle(tenantId, body.productId, itemProductIds); } catch (error) {
      if (error instanceof ValidationError) return c.json(error.toJSON(), 400);
      throw error;
    }

    let bom;
    try {
      bom = await prisma.bOM.create({
        data: {
        tenantId, productId: body.productId, name, version, effectiveFrom: effectiveFrom ?? null, effectiveTo: effectiveTo ?? null,
        ...(body.items?.length && {
          items: {
            create: body.items.map((item, i) => ({
              tenantId, productId: item.productId, quantity: item.quantity,
              unit: item.unit?.trim() ?? null, notes: item.notes?.trim() ?? null, sortOrder: i,
            })),
          },
        }),
        },
        include: { product: { select: { id: true, code: true, name: true } }, _count: { select: { items: true } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return c.json(new ConflictError('Bu ürün ve versiyon için BOM zaten mevcut.').toJSON(), 409);
      throw error;
    }
    return c.json({ data: bom }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.bOM.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('BOM', id).toJSON(), 404);

    const body = await c.req.json<{ name?: string; version?: string; isActive?: boolean; effectiveFrom?: string | null; effectiveTo?: string | null }>();
    let name: string | undefined;
    let version: string | undefined;
    let effectiveFrom: Date | null | undefined;
    let effectiveTo: Date | null | undefined;
    try {
      name = optionalText(body.name, 'name', 200);
      version = optionalText(body.version, 'version', 50);
      if (body.isActive !== undefined && typeof body.isActive !== 'boolean') throw new ValidationError('isActive boolean olmalıdır.');
      effectiveFrom = optionalDate(body.effectiveFrom, 'effectiveFrom');
      effectiveTo = optionalDate(body.effectiveTo, 'effectiveTo');
    } catch (error) {
      if (error instanceof ValidationError) return c.json(error.toJSON(), 400);
      throw error;
    }
    const resultingFrom = effectiveFrom === undefined ? existing.effectiveFrom : effectiveFrom;
    const resultingTo = effectiveTo === undefined ? existing.effectiveTo : effectiveTo;
    if (resultingFrom && resultingTo && resultingTo < resultingFrom) return c.json(new ValidationError('effectiveTo, effectiveFrom tarihinden önce olamaz.').toJSON(), 400);
    let updated;
    try {
      updated = await prisma.bOM.update({
        where: { id },
        data: {
        ...(name !== undefined && { name }),
        ...(version !== undefined && { version }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        effectiveFrom,
        effectiveTo,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return c.json(new ConflictError('Bu ürün ve versiyon için BOM zaten mevcut.').toJSON(), 409);
      throw error;
    }
    return c.json({ data: updated });
  },

  // ─── BOM Items ──────────────────────────────

  async addItem(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const bomId = requireParam(c, 'id');

    const bom = await prisma.bOM.findFirst({ where: { id: bomId, tenantId } });
    if (!bom) return c.json(new NotFoundError('BOM', bomId).toJSON(), 404);

    const body = await c.req.json<{ productId: string; quantity: number; unit?: string; notes?: string }>();
    try {
      if (typeof body.productId !== 'string' || !body.productId) throw new ValidationError('productId zorunludur.');
      positiveNumber(body.quantity, 'quantity');
      if (body.unit !== undefined) optionalText(body.unit, 'unit', 50);
      if (body.notes !== undefined) optionalText(body.notes, 'notes', 2000);
    } catch (error) {
      if (error instanceof ValidationError) return c.json(error.toJSON(), 400);
      throw error;
    }
    const product = await prisma.product.findFirst({ where: { id: body.productId, tenantId, deletedAt: null }, select: { id: true } });
    if (!product) return c.json(new NotFoundError('Ürün', body.productId).toJSON(), 404);
    const duplicate = await prisma.bOMItem.findFirst({ where: { tenantId, bomId, productId: body.productId }, select: { id: true } });
    if (duplicate) return c.json(new ConflictError('Bu ürün BOM içinde zaten mevcut.').toJSON(), 409);
    try { await assertNoBomCycle(tenantId, bom.productId, [body.productId]); } catch (error) {
      if (error instanceof ValidationError) return c.json(error.toJSON(), 400);
      throw error;
    }

    const maxSort = await prisma.bOMItem.aggregate({ where: { tenantId, bomId }, _max: { sortOrder: true } });
    let item;
    try {
      item = await prisma.bOMItem.create({
        data: { tenantId, bomId, productId: body.productId, quantity: body.quantity, unit: body.unit?.trim() ?? null, notes: body.notes?.trim() ?? null, sortOrder: (maxSort._max.sortOrder ?? -1) + 1 },
        include: { product: { select: { id: true, code: true, name: true } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return c.json(new ConflictError('Bu ürün BOM içinde zaten mevcut.').toJSON(), 409);
      }
      throw error;
    }
    return c.json({ data: item }, 201);
  },

  async removeItem(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const bomId = requireParam(c, 'id');
    const itemId = requireParam(c, 'itemId');

    const item = await prisma.bOMItem.findFirst({ where: { id: itemId, tenantId, bomId } });
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
    let name: string;
    let setupTime: number | undefined;
    let runTime: number | undefined;
    try {
      if (typeof body.workCenterId !== 'string' || !body.workCenterId) throw new ValidationError('workCenterId zorunludur.');
      name = requiredText(body.name, 'name', 200);
      if (!Number.isInteger(body.stepOrder) || body.stepOrder <= 0) throw new ValidationError('stepOrder pozitif bir tam sayı olmalıdır.');
      setupTime = nonNegativeNumber(body.setupTime, 'setupTime');
      runTime = nonNegativeNumber(body.runTime, 'runTime');
      if (body.notes !== undefined) optionalText(body.notes, 'notes', 2000);
    } catch (error) {
      if (error instanceof ValidationError) return c.json(error.toJSON(), 400);
      throw error;
    }
    const workCenter = await prisma.workCenter.findFirst({ where: { id: body.workCenterId, tenantId }, select: { id: true } });
    if (!workCenter) return c.json(new NotFoundError('İş Merkezi', body.workCenterId).toJSON(), 404);

    let routing;
    try {
      routing = await prisma.routingOperation.create({
        data: { tenantId, bomId, workCenterId: body.workCenterId, name, stepOrder: body.stepOrder, setupTime: setupTime ?? null, runTime: runTime ?? null, notes: body.notes?.trim() ?? null },
        include: { workCenter: { select: { id: true, code: true, name: true } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return c.json(new ConflictError('Bu adım sırası BOM içinde zaten mevcut.').toJSON(), 409);
      throw error;
    }
    return c.json({ data: routing }, 201);
  },

  async removeRouting(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const bomId = requireParam(c, 'id');
    const routingId = requireParam(c, 'routingId');

    const routing = await prisma.routingOperation.findFirst({ where: { id: routingId, tenantId, bomId } });
    if (!routing) return c.json(new NotFoundError('Routing', routingId).toJSON(), 404);

    await prisma.routingOperation.delete({ where: { id: routingId } });
    return c.json({ data: { success: true } });
  },
};
