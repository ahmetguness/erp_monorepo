import { Context } from 'hono';
import { Prisma } from '@prisma/client';
import { ConflictError, ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { requireTenantId } from '../../../../utils/context.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface StockValuationListQuery {
  page?: string;
  limit?: string;
  productId?: string;
  warehouseId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  movement?: 'in' | 'out';
}

function parsePositiveInteger(value: string | undefined, fallback: number, maximum: number, field: string): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new ValidationError(`${field} pozitif bir tam sayi olmalidir.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new ValidationError(`${field} 1-${maximum} araliginda olmalidir.`);
  }
  return parsed;
}

function parseDate(value: string | undefined, field: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new ValidationError(`${field} gecerli bir tarih olmalidir.`);
  return parsed;
}

function finiteNumber(
  value: unknown,
  field: string,
  options: { required?: boolean; minimum?: number; scale?: number; integerDigits?: number } = {},
): number {
  if (value === undefined && !options.required) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || (options.minimum !== undefined && value < options.minimum)) {
    throw new ValidationError(`${field} gecerli bir sayi olmalidir.`);
  }
  if (options.integerDigits !== undefined && Math.abs(value) >= 10 ** options.integerDigits) {
    throw new ValidationError(`${field} desteklenen sayisal araligi asiyor.`);
  }
  if (options.scale !== undefined) {
    const scaled = value * 10 ** options.scale;
    if (Math.abs(scaled - Math.round(scaled)) > 1e-7) {
      throw new ValidationError(`${field} en fazla ${options.scale} ondalik basamak icerebilir.`);
    }
  }
  return value;
}

function listWhere(tenantId: string, query: StockValuationListQuery) {
  const dateFrom = parseDate(query.dateFrom, 'dateFrom');
  const dateTo = parseDate(query.dateTo, 'dateTo');
  if (dateFrom && dateTo && dateFrom > dateTo) throw new ValidationError('dateFrom dateTo degerinden sonra olamaz.');
  if (query.movement && query.movement !== 'in' && query.movement !== 'out') throw new ValidationError('movement in veya out olmalidir.');
  const search = query.search?.trim();
  if (search && search.length > 100) throw new ValidationError('search en fazla 100 karakter olabilir.');
  return {
    tenantId,
    ...(query.productId && { productId: query.productId }),
    ...(query.warehouseId && { warehouseId: query.warehouseId }),
    ...(dateFrom || dateTo ? { date: { ...(dateFrom && { gte: dateFrom }), ...(dateTo && { lte: dateTo }) } } : {}),
    ...(query.movement === 'in' ? { qtyIn: { gt: 0 } } : {}),
    ...(query.movement === 'out' ? { qtyOut: { gt: 0 } } : {}),
    ...(search ? { product: { is: { OR: [
      { name: { contains: search, mode: 'insensitive' as const } },
      { code: { contains: search, mode: 'insensitive' as const } },
    ] } } } : {}),
  };
}

interface CreateStockValuationDTO {
  productId: string;
  warehouseId: string;
  movementId?: string;
  date: string;
  qtyIn?: number;
  qtyOut?: number;
  qtyBalance: number;
  unitCost: number;
  totalValue: number;
}

// ─────────────────────────────────────────────
// Stock Valuation Controller
// ─────────────────────────────────────────────

export const StockValuationController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as StockValuationListQuery;
    const page = parsePositiveInteger(query.page, 1, 100_000, 'page');
    const pageSize = parsePositiveInteger(query.limit, 20, 100, 'limit');
    const skip = (page - 1) * pageSize;
    const where = listWhere(tenantId, query);

    const [total, valuations] = await prisma.$transaction([
      prisma.stockValuation.count({ where }),
      prisma.stockValuation.findMany({
        where,
        include: {
          product: { select: { id: true, code: true, name: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: valuations,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async summary(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const where = listWhere(tenantId, c.req.query() as StockValuationListQuery);
    const valuations = await prisma.stockValuation.findMany({
      where,
      include: { product: { select: { id: true, code: true, name: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    const latest = new Map<string, (typeof valuations)[number]>();
    for (const valuation of valuations) {
      const key = `${valuation.productId}:${valuation.warehouseId}`;
      if (!latest.has(key)) latest.set(key, valuation);
    }
    return c.json({ data: Array.from(latest.values()) });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    let body: CreateStockValuationDTO;
    try {
      body = await c.req.json<CreateStockValuationDTO>();
    } catch {
      return c.json(new ValidationError('JSON istek govdesi gecersiz.').toJSON(), 400);
    }

    if (!body.productId || !body.warehouseId || !body.date || body.unitCost === undefined || body.totalValue === undefined) {
      return c.json(
        new ValidationError('productId, warehouseId, date, unitCost ve totalValue zorunludur.').toJSON(),
        400,
      );
    }

    const date = parseDate(body.date, 'date');
    const qtyIn = finiteNumber(body.qtyIn, 'qtyIn', { minimum: 0, scale: 3, integerDigits: 15 });
    const qtyOut = finiteNumber(body.qtyOut, 'qtyOut', { minimum: 0, scale: 3, integerDigits: 15 });
    const qtyBalance = finiteNumber(body.qtyBalance, 'qtyBalance', { required: true, scale: 3, integerDigits: 15 });
    const unitCost = finiteNumber(body.unitCost, 'unitCost', { required: true, minimum: 0, scale: 4, integerDigits: 14 });
    const totalValue = finiteNumber(body.totalValue, 'totalValue', { required: true, scale: 2, integerDigits: 16 });
    if (qtyIn > 0 && qtyOut > 0) throw new ValidationError('qtyIn ve qtyOut ayni anda pozitif olamaz.');
    if (Math.abs(totalValue - qtyBalance * unitCost) > 0.01) throw new ValidationError('totalValue, qtyBalance x unitCost ile uyusmalidir.');
    const [product, warehouse, movement] = await Promise.all([
      prisma.product.findFirst({ where: { id: body.productId, tenantId, deletedAt: null }, select: { id: true } }),
      prisma.warehouse.findFirst({ where: { id: body.warehouseId, tenantId }, select: { id: true } }),
      body.movementId ? prisma.stockMovement.findFirst({ where: { id: body.movementId, tenantId }, select: { id: true, productId: true, type: true, fromWarehouseId: true, toWarehouseId: true } }) : null,
    ]);
    if (!product) throw new ValidationError('Urun bu tenant icinde bulunamadi.');
    if (!warehouse) throw new ValidationError('Depo bu tenant icinde bulunamadi.');
    if (body.movementId && !movement) throw new ValidationError('Stok hareketi bu tenant icinde bulunamadi.');
    if (movement && (movement.productId !== body.productId || ![movement.fromWarehouseId, movement.toWarehouseId].includes(body.warehouseId))) {
      throw new ValidationError('Stok hareketi urun ve depo ile uyusmuyor.');
    }
    if (movement?.type === 'IN' || movement?.type === 'OPENING' || movement?.type === 'RETURN') {
      if (qtyIn <= 0 || qtyOut !== 0) throw new ValidationError('Giris hareketi qtyIn > 0 ve qtyOut = 0 gerektirir.');
    }
    if (movement?.type === 'OUT' && (qtyIn !== 0 || qtyOut <= 0)) {
      throw new ValidationError('Cikis hareketi qtyIn = 0 ve qtyOut > 0 gerektirir.');
    }
    if (body.movementId && await prisma.stockValuation.findFirst({ where: { tenantId, movementId: body.movementId, warehouseId: body.warehouseId }, select: { id: true } })) {
      throw new ConflictError('Bu stok hareketi ve depo icin degerleme kaydi zaten var.');
    }

    let valuation;
    try {
      valuation = await prisma.stockValuation.create({
        data: {
          tenantId,
          productId: body.productId,
          warehouseId: body.warehouseId,
          movementId: body.movementId ?? null,
          date: date!,
          qtyIn,
          qtyOut,
          qtyBalance,
          unitCost,
          totalValue,
        },
        include: {
          product: { select: { id: true, code: true, name: true } },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && body.movementId) {
        throw new ConflictError('Bu stok hareketi ve depo icin degerleme kaydi zaten var.');
      }
      throw error;
    }

    return c.json({ data: valuation }, 201);
  },
};
