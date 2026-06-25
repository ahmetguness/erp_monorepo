import { Context } from 'hono';
import { AuditAction, EntityType, MovementType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { getValidatedBody } from '../middleware/validateBody';
import {
  createStockCountBodySchema,
  createStockMovementBodySchema,
  finalizeStockCountBodySchema,
  type CreateStockCountBody,
} from '../schemas/request-body.schemas';
import { generateDocumentNumber } from '../utils/generate-number.js';
import { requireTenantId, requireUserId, requireParam } from '../utils/context.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';
import { createEventContext, domainEvents } from '../domain-events';
import {
  assertCanConsumeStock,
  assertStockCountApproval,
  getInventoryRules,
  getReorderSuggestions,
  recordInventoryCosting,
  resolveStockLevelLocationId,
  convertReorderSuggestionsToPurchaseRequest,
} from '../services/inventory-rules.service';

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

type CreateStockCountDTO = CreateStockCountBody;

interface FinalizeStockCountDTO {
  applyAdjustments: boolean;
  approvalReason?: string;
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

  async listReorderSuggestions(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const suggestions = await getReorderSuggestions(prisma, tenantId);
    return c.json({ data: suggestions });
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
    const userId = requireUserId(c);

    const body = getValidatedBody(c, createStockMovementBodySchema);

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

    const inventoryRules = await getInventoryRules(prisma, tenantId);
    const consumptionCheck = body.type === MovementType.OUT
      ? await assertCanConsumeStock(prisma, tenantId, {
          productId: body.productId,
          warehouseId: body.warehouseId,
          quantity: body.quantity,
          lotId: body.lotId ?? null,
        })
      : null;

    const movement = await prisma.$transaction(async (tx) => {
      const existingLevel = await tx.stockLevel.findFirst({
        where: { tenantId, productId: body.productId, warehouseId: body.warehouseId },
      });
      const previousQuantity = Number(existingLevel?.quantity ?? 0);
      const locId = await resolveStockLevelLocationId(tx, tenantId, body.warehouseId, existingLevel?.locationId);

      const stockMovement = await tx.stockMovement.create({
        data: {
          tenantId,
          productId: body.productId,
          type: body.type,
          quantity: body.quantity,
          unitCost: body.unitCost ?? null,
          lotId: body.lotId ?? null,
          batchId: body.batchId ?? null,
          ...(body.type === MovementType.OUT
            ? { fromWarehouseId: body.warehouseId }
            : { toWarehouseId: body.warehouseId }),
          notes: body.notes ?? null,
        },
      });

      // StockLevel güncelle — mevcut kaydın locationId'sini bul
      let resultingQuantity = previousQuantity;
      if (body.type === MovementType.IN || body.type === MovementType.OPENING) {
        resultingQuantity = previousQuantity + body.quantity;
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
        resultingQuantity = previousQuantity - body.quantity;
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
            quantity: -body.quantity,
          },
          update: { quantity: { decrement: body.quantity } },
        });
      } else if (body.type === MovementType.ADJUSTMENT) {
        resultingQuantity = body.quantity;
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

      await recordInventoryCosting(tx, tenantId, {
        movementId: stockMovement.id,
        productId: body.productId,
        warehouseId: body.warehouseId,
        type: body.type,
        quantity: body.quantity,
        previousQuantity,
        quantityChange: resultingQuantity - previousQuantity,
        resultingQuantity,
        unitCost: body.unitCost ?? null,
        date: stockMovement.createdAt,
      });

      return stockMovement;
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'inventory',
      entityType: EntityType.PRODUCT,
      entityId: body.productId,
      action: AuditAction.CREATE,
      newValues: {
        movementId: movement.id,
        type: movement.type,
        quantity: movement.quantity,
        warehouseId: body.warehouseId,
        unitCost: movement.unitCost,
      },
      ...getRequestMeta(c),
    });

    const product = await prisma.product.findFirst({
      where: { id: body.productId, tenantId, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        minStockLevel: true,
        stockLevels: { select: { quantity: true } },
      },
    });

    if (product && Number(product.minStockLevel) > 0) {
      const currentQuantity = product.stockLevels.reduce((total, level) => total + Number(level.quantity), 0);
      const minStockLevel = Number(product.minStockLevel);
      if (currentQuantity <= minStockLevel) {
        await domainEvents.publish({
          name: 'stock.low',
          context: createEventContext({ tenantId, userId }),
          payload: {
            productId: product.id,
            productCode: product.code,
            productName: product.name,
            currentQuantity,
            minStockLevel,
            warehouseId: body.warehouseId,
          },
        });
      }
    }

    return c.json({
      data: movement,
      ...(inventoryRules.negativeStockPolicy === 'WARN' && consumptionCheck?.warning
        ? { meta: { warnings: [consumptionCheck.warning] } }
        : {}),
    }, 201);
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
    const tenantId = requireTenantId(c);
    const countId = requireParam(c, 'id');

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
    const userId = requireUserId(c);

    const body = getValidatedBody(c, createStockCountBodySchema);

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

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'inventory',
      entityType: EntityType.OTHER,
      entityId: stockCount.id,
      action: AuditAction.CREATE,
      newValues: { id: stockCount.id, number: stockCount.number, warehouseId: stockCount.warehouseId, itemCount: stockCount.items.length },
      ...getRequestMeta(c),
    });

    return c.json({ data: stockCount }, 201);
  },

  async finalizeStockCount(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const countId = requireParam(c, 'id');

    const stockCount = await prisma.stockCount.findFirst({
      where: { id: countId, tenantId },
      include: { items: true },
    });

    if (!stockCount) return c.json(new NotFoundError('Sayım', countId).toJSON(), 404);
    if (stockCount.isFinalized) {
      return c.json(new ValidationError('Sayım zaten tamamlandı.').toJSON(), 400);
    }

    const body = getValidatedBody(c, finalizeStockCountBodySchema);
    const inventoryRules = await getInventoryRules(prisma, tenantId);
    const hasDifference = stockCount.items.some((item) => Number(item.difference) !== 0);

    const thresholdSetting = await prisma.moduleSetting.findFirst({
      where: { tenantId, module: 'inventory', key: 'stock_count_approval_threshold' },
    });
    const threshold = thresholdSetting ? Number(thresholdSetting.value) : 500;
    const totalDiffQty = stockCount.items.reduce((sum, item) => sum + Math.abs(Number(item.difference)), 0);

    if (hasDifference && totalDiffQty > threshold && !body.approvalReason?.trim()) {
      return c.json(
        new ValidationError(
          `Sayım farkı toplamı (${totalDiffQty}) limit değeri (${threshold}) üzerinde olduğu için onay sebebi (approvalReason) zorunludur.`,
        ).toJSON(),
        400,
      );
    }

    assertStockCountApproval({
      rules: inventoryRules,
      hasDifference,
      applyAdjustments: body.applyAdjustments,
      approvalReason: body.approvalReason ?? null,
    });

    await prisma.$transaction(async (tx) => {
      if (body.applyAdjustments) {
        // Fark olan kalemlere ADJUSTMENT hareketi oluştur
        for (const item of stockCount.items) {
          if (Number(item.difference) !== 0) {
            const existing = await tx.stockLevel.findFirst({
              where: {
                tenantId,
                productId: item.productId,
                warehouseId: stockCount.warehouseId,
              },
            });
            const previousQuantity = Number(existing?.quantity ?? 0);
            const difference = Number(item.difference);
            const stockMovement = await tx.stockMovement.create({
              data: {
                tenantId,
                productId: item.productId,
                type: MovementType.ADJUSTMENT,
                quantity: Math.abs(difference),
                ...(difference > 0
                  ? { toWarehouseId: stockCount.warehouseId }
                  : { fromWarehouseId: stockCount.warehouseId }),
                refType: 'STOCK_COUNT',
                refId: stockCount.id,
                notes: `Sayım düzeltmesi: ${stockCount.number}`,
              },
            });

            // Mevcut stok seviyesini bul (locationId eşleşmesi için)
            const locId = await resolveStockLevelLocationId(tx, tenantId, stockCount.warehouseId, item.locationId ?? existing?.locationId);

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

            await recordInventoryCosting(tx, tenantId, {
              movementId: stockMovement.id,
              productId: item.productId,
              warehouseId: stockCount.warehouseId,
              type: MovementType.ADJUSTMENT,
              quantity: Math.abs(difference),
              previousQuantity,
              quantityChange: difference,
              resultingQuantity: Number(item.countedQty),
              date: stockMovement.createdAt,
            });
          }
        }
      }

      await tx.stockCount.updateMany({
        where: { id: countId, tenantId },
        data: { isFinalized: true, finalizedAt: new Date() },
      });
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'inventory',
      entityType: EntityType.OTHER,
      entityId: countId,
      action: AuditAction.UPDATE,
      oldValues: { id: countId, isFinalized: stockCount.isFinalized },
      newValues: {
        id: countId,
        isFinalized: true,
        applyAdjustments: body.applyAdjustments,
        approvalReason: body.approvalReason ?? null,
      },
      ...getRequestMeta(c),
    });

    return c.json({ data: { success: true } });
  },

  async convertSuggestionsToRequest(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    const result = await prisma.$transaction(async (tx) => {
      return await convertReorderSuggestionsToPurchaseRequest(tx, tenantId, userId);
    });

    return c.json({ data: result }, 201);
  },

  async getValuationReconciliation(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const stockLevels = await prisma.stockLevel.findMany({
      where: { tenantId, product: { deletedAt: null } },
      include: { product: { select: { averageCost: true } } },
    });
    const totalInventoryValuation = stockLevels.reduce(
      (sum, sl) => sum + Number(sl.quantity) * Number(sl.product.averageCost ?? 0),
      0
    );

    const inventoryAccounts = await prisma.ledgerAccount.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
        OR: [
          { code: { startsWith: '15' } },
          { name: { contains: 'Stok', mode: 'insensitive' } },
          { name: { contains: 'Inventory', mode: 'insensitive' } },
        ],
      },
      select: { id: true, code: true, name: true },
    });

    const accountIds = inventoryAccounts.map((acc) => acc.id);

    const lineSums = await prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        tenantId,
        accountId: { in: accountIds },
        journalEntry: { isPosted: true },
      },
      _sum: { debit: true, credit: true },
    });

    const sumMap = new Map(
      lineSums.map((row) => [
        row.accountId,
        {
          debit: Number(row._sum.debit ?? 0),
          credit: Number(row._sum.credit ?? 0),
        },
      ]),
    );

    const accountsWithBalance = inventoryAccounts.map((acc) => {
      const sums = sumMap.get(acc.id) ?? { debit: 0, credit: 0 };
      const balance = sums.debit - sums.credit;
      return {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        balance,
      };
    });

    const totalLedgerBalance = accountsWithBalance.reduce((sum, acc) => sum + acc.balance, 0);
    const discrepancy = totalInventoryValuation - totalLedgerBalance;

    return c.json({
      data: {
        totalInventoryValuation,
        totalLedgerBalance,
        discrepancy,
        status: Math.abs(discrepancy) < 0.01 ? 'RECONCILED' : 'DISCREPANCY',
        accounts: accountsWithBalance,
      },
    });
  },
};
