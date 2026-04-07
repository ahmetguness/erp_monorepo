import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { ValidationError, ForbiddenError } from '../errors';

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
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const query = c.req.query() as StockValuationListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      ...(query.productId && { productId: query.productId }),
      ...(query.warehouseId && { warehouseId: query.warehouseId }),
      ...(query.dateFrom || query.dateTo
        ? {
            date: {
              ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
              ...(query.dateTo && { lte: new Date(query.dateTo) }),
            },
          }
        : {}),
    };

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

  async create(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const body = await c.req.json<CreateStockValuationDTO>();

    if (!body.productId || !body.warehouseId || !body.date || body.unitCost === undefined || body.totalValue === undefined) {
      return c.json(
        new ValidationError('productId, warehouseId, date, unitCost ve totalValue zorunludur.').toJSON(),
        400,
      );
    }

    const valuation = await prisma.stockValuation.create({
      data: {
        tenantId,
        productId: body.productId,
        warehouseId: body.warehouseId,
        movementId: body.movementId ?? null,
        date: new Date(body.date),
        qtyIn: body.qtyIn ?? 0,
        qtyOut: body.qtyOut ?? 0,
        qtyBalance: body.qtyBalance,
        unitCost: body.unitCost,
        totalValue: body.totalValue,
      },
      include: {
        product: { select: { id: true, code: true, name: true } },
      },
    });

    return c.json({ data: valuation }, 201);
  },
};
