import { CostingMethod, MovementType, Prisma, DeliveryNoteStatus, ReservationRefType } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ValidationError } from '../../errors';
import { generateDocumentNumber } from '../../utils/generate-number.js';
import { NEGATIVE_STOCK_POLICY_KEY, LEGACY_NEGATIVE_STOCK_KEY, RESERVATION_POLICY_KEY, LOT_SERIAL_POLICY_KEY, STOCK_COUNT_APPROVAL_POLICY_KEY, COSTING_METHOD_KEY, DEFAULT_STOCK_LOCATION_CODE } from './types.js';
import type { InventoryDbClient, NegativeStockPolicy, ReservationPolicy, LotSerialPolicy, StockCountApprovalPolicy, InventoryRules, StockPosition, StockConsumptionCheck, StockReorderSuggestion, SuggestionPriority, SalesVelocity, AdvancedStockSuggestion } from './types.js';
import { parseNegativeStockPolicy, parseReservationPolicy, parseLotSerialPolicy, parseStockCountApprovalPolicy, parseCostingMethod, quantityValue, getInventoryRules } from './policy.js';
import { resolveStockLevelLocationId, getStockPosition, assertCanConsumeStock, assertCanReserveStock, releaseInventoryReservations, releaseExpiredInventoryReservations, assertStockCountApproval } from './availability.js';
import { calculateLayerCost, recordInventoryCosting } from './costing.js';
import { processDeliveryNoteStock } from './delivery.js';
import { determineSalesVelocityTrend, determineSuggestionPriority } from '../../modules/inventory/domain/replenishment-policy.js';

export { determineSalesVelocityTrend, determineSuggestionPriority } from '../../modules/inventory/domain/replenishment-policy.js';

export async function getReorderSuggestions(
  db: InventoryDbClient,
  tenantId: string,
): Promise<StockReorderSuggestion[]> {
  const stockLevels = await db.stockLevel.findMany({
    where: {
      tenantId,
      product: { tenantId, deletedAt: null, isActive: true, minStockLevel: { gt: 0 } },
    },
    include: {
      product: { select: { id: true, code: true, name: true, minStockLevel: true, averageCost: true, purchasePrice: true } },
      warehouse: { select: { id: true, code: true, name: true } },
    },
  });

  const suggestions: StockReorderSuggestion[] = [];
  const processedProductWarehouses = new Set<string>();
  for (const level of stockLevels) {
    const productWarehouseKey = `${level.productId}:${level.warehouseId}`;
    if (processedProductWarehouses.has(productWarehouseKey)) continue;
    processedProductWarehouses.add(productWarehouseKey);

    const position = await getStockPosition(db, tenantId, level.productId, level.warehouseId);
    const minStockLevel = quantityValue(level.product.minStockLevel);
    if (position.available >= minStockLevel) continue;

    const unitCost = quantityValue(level.product.averageCost) > 0
      ? quantityValue(level.product.averageCost)
      : quantityValue(level.product.purchasePrice);
    const suggestedQuantity = Math.ceil(minStockLevel - position.available);
    const thirtyDayOut = await db.stockMovement.aggregate({
      where: {
        tenantId,
        productId: level.productId,
        fromWarehouseId: level.warehouseId,
        type: MovementType.OUT,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      _sum: { quantity: true },
    });
    const dailyUsage = quantityValue(thirtyDayOut._sum.quantity) / 30;

    suggestions.push({
      productId: level.product.id,
      productCode: level.product.code,
      productName: level.product.name,
      warehouseId: level.warehouse.id,
      warehouseCode: level.warehouse.code,
      warehouseName: level.warehouse.name,
      onHand: position.onHand,
      reserved: position.reserved,
      available: position.available,
      minStockLevel,
      suggestedQuantity,
      estimatedDaysToStockout: dailyUsage > 0 ? Math.max(0, Math.floor(position.available / dailyUsage)) : null,
      unitCost,
      estimatedCost: suggestedQuantity * unitCost,
    });
  }

  return suggestions.sort((a, b) => b.suggestedQuantity - a.suggestedQuantity);
}

// ── Advanced Stock Suggestions ──────────────────────────

export async function getAdvancedStockSuggestions(
  db: InventoryDbClient,
  tenantId: string,
): Promise<AdvancedStockSuggestion[]> {
  const stockLevels = await db.stockLevel.findMany({
    where: {
      tenantId,
      product: { tenantId, deletedAt: null, isActive: true, minStockLevel: { gt: 0 } },
    },
    include: {
      product: { select: { id: true, code: true, name: true, minStockLevel: true, averageCost: true, purchasePrice: true } },
      warehouse: { select: { id: true, code: true, name: true } },
    },
  });

  const now = Date.now();
  const ms30 = 30 * 24 * 60 * 60 * 1000;
  const ms60 = 60 * 24 * 60 * 60 * 1000;
  const ms90 = 90 * 24 * 60 * 60 * 1000;

  const suggestions: AdvancedStockSuggestion[] = [];
  const processed = new Set<string>();

  for (const level of stockLevels) {
    const key = `${level.productId}:${level.warehouseId}`;
    if (processed.has(key)) continue;
    processed.add(key);

    const position = await getStockPosition(db, tenantId, level.productId, level.warehouseId);
    const minStock = quantityValue(level.product.minStockLevel);

    // Calculate sales velocity over 30, 60, and 90 days
    const [out30, out60, out90] = await Promise.all([
      db.stockMovement.aggregate({
        where: { tenantId, productId: level.productId, fromWarehouseId: level.warehouseId, type: MovementType.OUT, createdAt: { gte: new Date(now - ms30) } },
        _sum: { quantity: true },
      }),
      db.stockMovement.aggregate({
        where: { tenantId, productId: level.productId, fromWarehouseId: level.warehouseId, type: MovementType.OUT, createdAt: { gte: new Date(now - ms60) } },
        _sum: { quantity: true },
      }),
      db.stockMovement.aggregate({
        where: { tenantId, productId: level.productId, fromWarehouseId: level.warehouseId, type: MovementType.OUT, createdAt: { gte: new Date(now - ms90) } },
        _sum: { quantity: true },
      }),
    ]);

    const daily30 = quantityValue(out30._sum.quantity) / 30;
    const daily60 = quantityValue(out60._sum.quantity) / 60;
    const daily90 = quantityValue(out90._sum.quantity) / 90;

    const trend = determineSalesVelocityTrend(daily30, daily60, daily90);

    // Active reservations
    const activeReservations = await db.inventoryReservation.findMany({
      where: {
        tenantId,
        productId: level.productId,
        warehouseId: level.warehouseId,
        releasedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { quantity: true },
    });
    const reservationCount = activeReservations.length;
    const pendingReservationQty = activeReservations.reduce((sum, r) => sum + quantityValue(r.quantity), 0);
    const reservationRatio = position.onHand > 0 ? pendingReservationQty / position.onHand : 0;

    const unitCost = quantityValue(level.product.averageCost) > 0
      ? quantityValue(level.product.averageCost)
      : quantityValue(level.product.purchasePrice);

    // Use best velocity estimate for optimal reorder quantity
    const bestDailyUsage = daily30 > 0 ? daily30 : daily60 > 0 ? daily60 : daily90;
    const targetDays = 30; // Reorder to cover 30 days
    const velocityBasedQty = bestDailyUsage > 0 ? Math.ceil(bestDailyUsage * targetDays) : 0;
    const deficitBasedQty = Math.max(0, Math.ceil(minStock - position.available));
    const suggestedQuantity = Math.max(deficitBasedQty, velocityBasedQty);

    if (suggestedQuantity <= 0 && position.available >= minStock) continue;

    const estimatedDaysToStockout = bestDailyUsage > 0
      ? Math.max(0, Math.floor(position.available / bestDailyUsage))
      : null;

    const coverageDays = bestDailyUsage > 0
      ? Math.floor((position.available + suggestedQuantity) / bestDailyUsage)
      : null;

    const priority = determineSuggestionPriority(position.available, minStock, estimatedDaysToStockout, reservationRatio);

    suggestions.push({
      productId: level.product.id,
      productCode: level.product.code,
      productName: level.product.name,
      warehouseId: level.warehouse.id,
      warehouseCode: level.warehouse.code,
      warehouseName: level.warehouse.name,
      onHand: position.onHand,
      reserved: position.reserved,
      available: position.available,
      minStockLevel: minStock,
      suggestedQuantity,
      estimatedDaysToStockout,
      unitCost,
      estimatedCost: suggestedQuantity * unitCost,
      salesVelocity: { daily30, daily60, daily90, trend },
      reservationCount,
      pendingReservationQty,
      priority,
      coverageDays,
    });
  }

  // Sort by priority (CRITICAL first), then by estimated days to stockout
  const priorityOrder: Record<SuggestionPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return suggestions.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    const aDays = a.estimatedDaysToStockout ?? Infinity;
    const bDays = b.estimatedDaysToStockout ?? Infinity;
    return aDays - bDays;
  });
}

export async function convertReorderSuggestionsToPurchaseRequest(
  db: InventoryDbClient,
  tenantId: string,
  userId: string,
): Promise<{ id: string; number: string; itemCount: number }> {
  const suggestions = await getReorderSuggestions(db, tenantId);
  if (!suggestions.length) {
    throw new ValidationError('Oluşturulacak satın alma önerisi bulunamadı.');
  }

  const number = await generateDocumentNumber(tenantId, 'purchase_request', 'PR-', 'purchaseRequest');
  const totalEstimated = suggestions.reduce((sum, s) => sum + s.estimatedCost, 0);

  const request = await db.purchaseRequest.create({
    data: {
      tenantId,
      number,
      date: new Date(),
      status: 'DRAFT',
      notes: 'Stok seviyesi sipariş önerilerinden otomatik oluşturuldu.',
      totalEstimated,
      createdById: userId,
      items: {
        create: suggestions.map((s) => ({
          tenantId,
          productId: s.productId,
          description: `${s.warehouseName} deposu için önerilen miktar.`,
          quantity: s.suggestedQuantity,
          unitPrice: s.unitCost,
        })),
      },
    },
  });

  return { id: request.id, number: request.number, itemCount: suggestions.length };
}
