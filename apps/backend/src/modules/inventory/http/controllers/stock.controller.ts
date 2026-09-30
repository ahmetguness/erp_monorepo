import { AuditAction, EntityType, MovementType } from "@prisma/client";
import { Context } from "hono";
import {
  createEventContext,
  domainEvents,
} from "../../../../domain-events/index.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../../errors/index.js";
import { prisma } from "../../../../lib/prisma.js";
import { getValidatedBody } from "../../../../middleware/validateBody.js";
import {
  createStockCountBodySchema,
  createStockMovementBodySchema,
  finalizeStockCountBodySchema,
} from "../../../../schemas/request-body.schemas.js";
import {
  assertStockCountApproval,
  convertReorderSuggestionsToPurchaseRequest,
  getAdvancedStockSuggestions,
  getInventoryRules,
  getReorderSuggestions,
  lockInventoryPosition,
  recordInventoryCosting,
  releaseExpiredInventoryReservations,
  resolveStockLevelLocationId,
} from "../../../../services/inventory-rules.service.js";
import { StockAlertService } from "../../../../services/stock-alert.service.js";
import { createAuditLog, getRequestMeta } from "../../../../utils/audit.js";
import {
  requireParam,
  requireTenantId,
  requireUserId,
} from "../../../../utils/context.js";
import { generateDocumentNumber } from "../../../../utils/generate-number.js";
import { inventoryApplication } from "../../composition.js";
import { parseRecordStockMovement } from "../../application/operations/index.js";

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
  locationId?: string;
  belowMin?: string;
}

// ─────────────────────────────────────────────
// Stock Controller
// StockMovement, StockLevel, StockCount
// ─────────────────────────────────────────────

export const StockController = {
  // ── Stock Levels ─────────────────────────────

  async stockAlerts(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const requestedLimit = Number(c.req.query("limit") ?? 8);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(25, Math.max(1, requestedLimit))
      : 8;
    const alerts = await new StockAlertService(prisma).dashboard(
      tenantId,
      limit,
    );
    return c.json({ data: alerts });
  },

  async listStockLevels(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as StockLevelListQuery;

    const result = await inventoryApplication.stockLevelQueries.list(tenantId, {
      warehouseId: query.warehouseId,
      productId: query.productId,
      locationId: query.locationId,
      belowMinimum: query.belowMin === "true",
    });

    return c.json({ data: result });
  },

  async listReorderSuggestions(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const suggestions = await getReorderSuggestions(prisma, tenantId);
    return c.json({ data: suggestions });
  },

  async listAdvancedSuggestions(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const suggestions = await getAdvancedStockSuggestions(prisma, tenantId);
    return c.json({ data: suggestions });
  },

  async cleanupExpiredReservations(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const releasedCount = await releaseExpiredInventoryReservations(
      prisma,
      tenantId,
    );
    return c.json({ data: { releasedCount } });
  },

  // ── Stock Movements ──────────────────────────

  async listMovements(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as StockMovementListQuery;
    const parsedPage = Number(query.page ?? "1");
    const parsedLimit = Number(query.limit ?? "20");
    if (
      !Number.isInteger(parsedPage) ||
      parsedPage < 1 ||
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1
    ) {
      throw new ValidationError("page ve limit pozitif tam sayi olmalidir.");
    }
    if (query.type && !Object.values(MovementType).includes(query.type)) {
      throw new ValidationError("Gecersiz stok hareketi tipi.");
    }
    const parseMovementDate = (value: string | undefined, endOfDay = false) => {
      if (!value) return undefined;
      const date = new Date(value);
      if (Number.isNaN(date.getTime()))
        throw new ValidationError("Gecersiz tarih filtresi.");
      if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value))
        date.setUTCHours(23, 59, 59, 999);
      return date;
    };
    const dateFrom = parseMovementDate(query.dateFrom);
    const dateTo = parseMovementDate(query.dateTo, true);
    if (dateFrom && dateTo && dateFrom > dateTo)
      throw new ValidationError("dateFrom dateTo degerinden sonra olamaz.");
    const page = parsedPage;
    const pageSize = Math.min(100, parsedLimit);
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
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom && { gte: dateFrom }),
              ...(dateTo && { lte: dateTo }),
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
        orderBy: { createdAt: "desc" },
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

    if (
      !body.productId ||
      !body.type ||
      body.quantity === undefined ||
      !body.warehouseId
    ) {
      return c.json(
        new ValidationError(
          "productId, type, quantity ve warehouseId zorunludur.",
        ).toJSON(),
        400,
      );
    }

    const command = parseRecordStockMovement(body);
    const result = await inventoryApplication.recordStockMovement.execute(
      { tenantId, userId },
      command,
    );
    const { movement } = result;

    if (!result.replayed) {
      await createAuditLog(prisma, {
        tenantId,
        userId,
        module: "inventory",
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

      if (result.lowStockSignal) {
        await domainEvents.publish({
          name: "stock.low",
          context: createEventContext({ tenantId, userId }),
          payload: result.lowStockSignal,
        });
      }
    }

    return c.json(
      {
        data: movement,
        ...(result.warning ? { meta: { warnings: [result.warning] } } : {}),
      },
      201,
    );
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
      orderBy: { date: "desc" },
    });

    return c.json({ data: stockCounts });
  },

  async getStockCount(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const countId = requireParam(c, "id");

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

    if (!stockCount)
      return c.json(new NotFoundError("Sayım", countId).toJSON(), 404);

    return c.json({ data: stockCount });
  },

  async createStockCount(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = getValidatedBody(c, createStockCountBodySchema);

    const countDate = new Date(body.date);
    if (Number.isNaN(countDate.getTime())) {
      return c.json(
        new ValidationError("Geçerli bir sayım tarihi zorunludur.").toJSON(),
        400,
      );
    }

    const warehouse = await prisma.warehouse.findFirst({
      where: { id: body.warehouseId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!warehouse)
      return c.json(new NotFoundError("Depo", body.warehouseId).toJSON(), 404);

    const itemKeys = body.items.map(
      (item) => `${item.productId}:${item.locationId ?? "*"}`,
    );
    if (new Set(itemKeys).size !== itemKeys.length) {
      return c.json(
        new ValidationError(
          "Aynı ürün ve lokasyon sayımda birden fazla kez kullanılamaz.",
        ).toJSON(),
        400,
      );
    }

    const productIds = [...new Set(body.items.map((item) => item.productId))];
    const products = await prisma.product.findMany({
      where: { tenantId, id: { in: productIds }, deletedAt: null },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      return c.json(
        new ValidationError(
          "Sayım kalemlerinden en az biri bu firmaya ait aktif bir ürün değildir.",
        ).toJSON(),
        400,
      );
    }

    const requestedLocationIds = [
      ...new Set(
        body.items.flatMap((item) =>
          item.locationId ? [item.locationId] : [],
        ),
      ),
    ];
    if (requestedLocationIds.length) {
      const locations = await prisma.location.findMany({
        where: {
          tenantId,
          warehouseId: body.warehouseId,
          id: { in: requestedLocationIds },
          isActive: true,
        },
        select: { id: true },
      });
      if (locations.length !== requestedLocationIds.length) {
        return c.json(
          new ValidationError(
            "Sayım lokasyonlarından en az biri seçilen depoya veya firmaya ait değildir.",
          ).toJSON(),
          400,
        );
      }
    }

    const levels = await prisma.stockLevel.findMany({
      where: {
        tenantId,
        warehouseId: body.warehouseId,
        productId: { in: productIds },
      },
      select: { productId: true, locationId: true, quantity: true },
    });
    const expectedQuantity = (productId: string, locationId?: string | null) =>
      levels
        .filter(
          (level) =>
            level.productId === productId &&
            (!locationId || level.locationId === locationId),
        )
        .reduce((sum, level) => sum + Number(level.quantity), 0);

    const number = await generateDocumentNumber(
      tenantId,
      "stock_count",
      "SC-",
      "stockCount",
    );

    const stockCount = await prisma.stockCount.create({
      data: {
        tenantId,
        warehouseId: body.warehouseId,
        number,
        date: countDate,
        notes: body.notes ?? null,
        createdById: userId,
        items: {
          create: body.items.map((item) => {
            const expectedQty = expectedQuantity(
              item.productId,
              item.locationId,
            );
            return {
              tenantId,
              productId: item.productId,
              locationId: item.locationId ?? null,
              expectedQty,
              countedQty: item.countedQty,
              difference: item.countedQty - expectedQty,
            };
          }),
        },
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: "inventory",
      entityType: EntityType.OTHER,
      entityId: stockCount.id,
      action: AuditAction.CREATE,
      newValues: {
        id: stockCount.id,
        number: stockCount.number,
        warehouseId: stockCount.warehouseId,
        itemCount: stockCount.items.length,
      },
      ...getRequestMeta(c),
    });

    return c.json({ data: stockCount }, 201);
  },

  async finalizeStockCount(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const countId = requireParam(c, "id");

    const stockCount = await prisma.stockCount.findFirst({
      where: { id: countId, tenantId },
      include: { items: true },
    });

    if (!stockCount)
      return c.json(new NotFoundError("Sayım", countId).toJSON(), 404);
    if (stockCount.isFinalized) {
      return c.json(
        new ValidationError("Sayım zaten tamamlandı.").toJSON(),
        400,
      );
    }

    const body = getValidatedBody(c, finalizeStockCountBodySchema);
    const inventoryRules = await getInventoryRules(prisma, tenantId);
    const hasDifference = stockCount.items.some(
      (item) => Number(item.difference) !== 0,
    );

    const thresholdSetting = await prisma.moduleSetting.findFirst({
      where: {
        tenantId,
        module: "inventory",
        key: "stock_count_approval_threshold",
      },
    });
    const threshold = thresholdSetting ? Number(thresholdSetting.value) : 500;
    const totalDiffQty = stockCount.items.reduce(
      (sum, item) => sum + Math.abs(Number(item.difference)),
      0,
    );

    if (
      hasDifference &&
      totalDiffQty > threshold &&
      !body.approvalReason?.trim()
    ) {
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
      const claimed = await tx.stockCount.updateMany({
        where: { id: countId, tenantId, isFinalized: false },
        data: {
          isFinalized: true,
          finalizedAt: new Date(),
          finalizedById: userId,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictError(
          "Sayım eş zamanlı olarak tamamlandı. Sayfayı yenileyin.",
        );
      }

      if (body.applyAdjustments) {
        // Fark olan kalemlere ADJUSTMENT hareketi oluştur
        for (const item of [...stockCount.items].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        )) {
          await lockInventoryPosition(
            tx,
            tenantId,
            item.productId,
            stockCount.warehouseId,
          );
          const currentLevels = await tx.stockLevel.findMany({
            where: {
              tenantId,
              productId: item.productId,
              warehouseId: stockCount.warehouseId,
              ...(item.locationId ? { locationId: item.locationId } : {}),
            },
            orderBy: { id: "asc" },
          });
          const previousQuantity = currentLevels.reduce(
            (sum, level) => sum + Number(level.quantity),
            0,
          );
          const targetQuantity = Number(item.countedQty);
          const difference = targetQuantity - previousQuantity;
          if (Math.abs(difference) > 0.000001) {
            const stockMovement = await tx.stockMovement.create({
              data: {
                tenantId,
                productId: item.productId,
                type: MovementType.ADJUSTMENT,
                quantity: Math.abs(difference),
                ...(difference > 0
                  ? { toWarehouseId: stockCount.warehouseId }
                  : { fromWarehouseId: stockCount.warehouseId }),
                refType: "STOCK_COUNT",
                refId: stockCount.id,
                notes: `Sayım düzeltmesi: ${stockCount.number}`,
              },
            });

            // Mevcut stok seviyesini bul (locationId eşleşmesi için)
            if (item.locationId) {
              await tx.stockLevel.upsert({
                where: {
                  productId_warehouseId_locationId: {
                    productId: item.productId,
                    warehouseId: stockCount.warehouseId,
                    locationId: item.locationId,
                  },
                },
                create: {
                  tenantId,
                  productId: item.productId,
                  warehouseId: stockCount.warehouseId,
                  locationId: item.locationId,
                  quantity: targetQuantity,
                },
                update: { quantity: targetQuantity },
              });
            } else if (difference > 0) {
              const locId = await resolveStockLevelLocationId(
                tx,
                tenantId,
                stockCount.warehouseId,
                currentLevels[0]?.locationId,
              );
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
                  quantity: difference,
                },
                update: { quantity: { increment: difference } },
              });
            } else {
              let remaining = Math.abs(difference);
              for (const level of currentLevels) {
                if (remaining <= 0.000001) break;
                const decrement = Math.min(
                  Math.max(0, Number(level.quantity)),
                  remaining,
                );
                if (decrement > 0) {
                  await tx.stockLevel.update({
                    where: { id: level.id },
                    data: { quantity: { decrement } },
                  });
                  remaining -= decrement;
                }
              }
              if (remaining > 0.000001) {
                throw new ConflictError(
                  "Depo toplamı negatif stok üretmeden sayım miktarına uzlaştırılamadı.",
                );
              }
            }

            await recordInventoryCosting(tx, tenantId, {
              movementId: stockMovement.id,
              productId: item.productId,
              warehouseId: stockCount.warehouseId,
              type: MovementType.ADJUSTMENT,
              quantity: Math.abs(difference),
              previousQuantity,
              quantityChange: difference,
              resultingQuantity: targetQuantity,
              date: stockMovement.createdAt,
            });
          }
        }
      }
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: "inventory",
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
      return await convertReorderSuggestionsToPurchaseRequest(
        tx,
        tenantId,
        userId,
      );
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
      (sum, sl) =>
        sum + Number(sl.quantity) * Number(sl.product.averageCost ?? 0),
      0,
    );

    const inventoryAccounts = await prisma.ledgerAccount.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
        OR: [
          { code: { startsWith: "15" } },
          { name: { contains: "Stok", mode: "insensitive" } },
          { name: { contains: "Inventory", mode: "insensitive" } },
        ],
      },
      select: { id: true, code: true, name: true },
    });

    const accountIds = inventoryAccounts.map((acc) => acc.id);

    const lineSums = await prisma.journalEntryLine.groupBy({
      by: ["accountId"],
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

    const totalLedgerBalance = accountsWithBalance.reduce(
      (sum, acc) => sum + acc.balance,
      0,
    );
    const discrepancy = totalInventoryValuation - totalLedgerBalance;

    return c.json({
      data: {
        totalInventoryValuation,
        totalLedgerBalance,
        discrepancy,
        status: Math.abs(discrepancy) < 0.01 ? "RECONCILED" : "DISCREPANCY",
        accounts: accountsWithBalance,
      },
    });
  },
};
