import { Context } from 'hono';
import { MovementType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';
import { generateDocumentNumber } from '../utils/generate-number.js';
import { requireTenantId } from '../utils/context.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface StockMovementListQuery {
  page?: string;
  limit?: string;
  productId?: string;
  warehouseId?: string;
  type?: MovementType;
  dateFrom?: string;
  dateTo?: string;
}

interface StockLevelListQuery {
  warehouseId?: string;
  productId?: string;
  belowMin?: string;
}

interface CreateStockCountDTO {
  warehouseId: string;
  date: string;
  notes?: string;
  items: Array<{
    productId: string;
    locationId?: string;
    expectedQty: number;
    countedQty: number;
  }>;
}

interface FinalizeStockCountDTO {
  applyAdjustments: boolean;
}

// ─────────────────────────────────────────────
// Stock Controller
// StockMovement, StockLevel, StockCount
// ─────────────────────────────────────────────

export const StockController = {
  // ── Stock Levels ─────────────────────────────

  async listStockLevels(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as StockLevelListQuery;

    const stockLevels = await prisma.stockLevel.findMany({
      where: {
        tenantId,
        ...(query.warehouseId && { warehouseId: query.warehouseId }),
        ...(query.productId && { productId: query.productId }),
      },
      include: {
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            minStockLevel: true,
            unit: { select: { code: true } },
          },
        },
        warehouse: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ warehouse: { name: 'asc' } }, { product: { name: 'asc' } }],
    });

    const result = query.belowMin === 'true'
      ? stockLevels.filter((sl) => Number(sl.quantity) < Number(sl.product.minStockLevel))
      : stockLevels;

    return c.json({ data: result });
  },

  // ── Stock Movements ──────────────────────────

  async listMovements(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as StockMovementListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      ...(query.productId && { productId: query.productId }),
      ...(query.warehouseId && {
        OR: [
          { fromWarehouseId: query.warehouseId },
          { toWarehouseId: query.warehouseId },
        ],
      }),
      ...(query.type && { type: query.type }),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
              ...(query.dateTo && { lte: new Date(query.dateTo) }),
            },
          }
        : {}),
    };

    const [total, movements] = await prisma.$transaction([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        include: {
          product: { select: { id: true, code: true, name: true } },
          fromWarehouse: { select: { id: true, name: true } },
          toWarehouse: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: movements,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async createManualMovement(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{
      productId: string;
      type: MovementType;
      quantity: number;
      warehouseId: string;
      unitCost?: number;
      notes?: string;
    }>();

    if (!body.productId || !body.type || !body.quantity || !body.warehouseId) {
      return c.json(
        new ValidationError('productId, type, quantity ve warehouseId zorunludur.').toJSON(),
        400,
      );
    }

    const allowedManualTypes: MovementType[] = [
      MovementType.IN,
      MovementType.OUT,
      MovementType.ADJUSTMENT,
      MovementType.OPENING,
    ];

    if (!allowedManualTypes.includes(body.type)) {
      return c.json(
        new ValidationError(
          `Manuel hareket için geçerli tipler: ${allowedManualTypes.join(', ')}`,
        ).toJSON(),
        400,
      );
    }

    if (body.quantity <= 0) {
      return c.json(new ValidationError('Miktar 0\'dan büyük olmalıdır.').toJSON(), 400);
    }

    const movement = await prisma.$transaction(async (tx) => {
      const stockMovement = await tx.stockMovement.create({
        data: {
          tenantId,
          productId: body.productId,
          type: body.type,
          quantity: body.quantity,
          unitCost: body.unitCost ?? null,
          ...(body.type === MovementType.OUT
            ? { fromWarehouseId: body.warehouseId }
            : { toWarehouseId: body.warehouseId }),
          notes: body.notes ?? null,
        },
      });

      // StockLevel güncelle — mevcut kaydın locationId'sini bul
      const existingLevel = await tx.stockLevel.findFirst({
        where: { tenantId, productId: body.productId, warehouseId: body.warehouseId },
      });
      const locId = existingLevel?.locationId ?? '';

      if (body.type === MovementType.IN || body.type === MovementType.OPENING) {
        await tx.stockLevel.upsert({
          where: {
            productId_warehouseId_locationId: {
              productId: body.productId,
              warehouseId: body.warehouseId,
              locationId: locId,
            },
          },
          create: {
            tenantId,
            productId: body.productId,
            warehouseId: body.warehouseId,
            locationId: locId,
            quantity: body.quantity,
          },
          update: { quantity: { increment: body.quantity } },
        });
      } else if (body.type === MovementType.OUT) {
        await tx.stockLevel.updateMany({
          where: { tenantId, productId: body.productId, warehouseId: body.warehouseId },
          data: { quantity: { decrement: body.quantity } },
        });
      } else if (body.type === MovementType.ADJUSTMENT) {
        await tx.stockLevel.upsert({
          where: {
            productId_warehouseId_locationId: {
              productId: body.productId,
              warehouseId: body.warehouseId,
              locationId: locId,
            },
          },
          create: {
            tenantId,
            productId: body.productId,
            warehouseId: body.warehouseId,
            locationId: locId,
            quantity: body.quantity,
          },
          update: { quantity: body.quantity },
        });
      }

      return stockMovement;
    });

    return c.json({ data: movement }, 201);
  },

  // ── Stock Counts ─────────────────────────────

  async listStockCounts(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const stockCounts = await prisma.stockCount.findMany({
      where: { tenantId },
      include: {
        warehouse: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { date: 'desc' },
    });

    return c.json({ data: stockCounts });
  },

  async getStockCount(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const countId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const stockCount = await prisma.stockCount.findFirst({
      where: { id: countId, tenantId },
      include: {
        warehouse: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    if (!stockCount) return c.json(new NotFoundError('Sayım', countId).toJSON(), 404);

    return c.json({ data: stockCount });
  },

  async createStockCount(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<CreateStockCountDTO>();

    if (!body.warehouseId || !body.date || !body.items?.length) {
      return c.json(
        new ValidationError('warehouseId, date ve en az bir kalem zorunludur.').toJSON(),
        400,
      );
    }
    const number = await generateDocumentNumber(tenantId, 'stock_count', 'SC-', 'stockCount');

    const stockCount = await prisma.stockCount.create({
      data: {
        tenantId,
        warehouseId: body.warehouseId,
        number,
        date: new Date(body.date),
        notes: body.notes ?? null,
        items: {
          create: body.items.map((item) => ({
            tenantId,
            productId: item.productId,
            locationId: item.locationId ?? null,
            expectedQty: item.expectedQty,
            countedQty: item.countedQty,
            difference: item.countedQty - item.expectedQty,
          })),
        },
      },
      include: {
        items: {
          include: { product: { select: { id: true, code: true, name: true } } },
        },
      },
    });

    return c.json({ data: stockCount }, 201);
  },

  async finalizeStockCount(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const countId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const stockCount = await prisma.stockCount.findFirst({
      where: { id: countId, tenantId },
      include: { items: true },
    });

    if (!stockCount) return c.json(new NotFoundError('Sayım', countId).toJSON(), 404);
    if (stockCount.isFinalized) {
      return c.json(new ValidationError('Sayım zaten tamamlandı.').toJSON(), 400);
    }

    const body = await c.req.json<FinalizeStockCountDTO>();

    await prisma.$transaction(async (tx) => {
      if (body.applyAdjustments) {
        // Fark olan kalemlere ADJUSTMENT hareketi oluştur
        for (const item of stockCount.items) {
          if (Number(item.difference) !== 0) {
            await tx.stockMovement.create({
              data: {
                tenantId,
                productId: item.productId,
                type: MovementType.ADJUSTMENT,
                quantity: Math.abs(Number(item.difference)),
                ...(Number(item.difference) > 0
                  ? { toWarehouseId: stockCount.warehouseId }
                  : { fromWarehouseId: stockCount.warehouseId }),
                notes: `Sayım düzeltmesi: ${stockCount.number}`,
              },
            });

            // Mevcut stok seviyesini bul (locationId eşleşmesi için)
            const existing = await tx.stockLevel.findFirst({
              where: {
                tenantId,
                productId: item.productId,
                warehouseId: stockCount.warehouseId,
              },
            });

            const locId = item.locationId ?? existing?.locationId ?? '';

            await tx.stockLevel.upsert({
              where: {
                productId_warehouseId_locationId: {
                  productId: item.productId,
                  warehouseId: stockCount.warehouseId,
                  locationId: locId,
                },
              },
              create: {
                tenantId,
                productId: item.productId,
                warehouseId: stockCount.warehouseId,
                locationId: locId,
                quantity: item.countedQty,
              },
              update: { quantity: item.countedQty },
            });
          }
        }
      }

      await tx.stockCount.update({
        where: { id: countId },
        data: { isFinalized: true, finalizedAt: new Date() },
      });
    });

    return c.json({ data: { success: true } });
  },
};
