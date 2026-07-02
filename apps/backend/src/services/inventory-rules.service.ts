import { CostingMethod, MovementType, Prisma, DeliveryNoteStatus } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ValidationError } from '../errors';
import { generateDocumentNumber } from '../utils/generate-number.js';


type InventoryDbClient = PrismaClient | Prisma.TransactionClient;

export type NegativeStockPolicy = 'ALLOW' | 'WARN' | 'BLOCK';
export type ReservationPolicy = 'IGNORE' | 'RESPECT';
export type LotSerialPolicy = 'OPTIONAL' | 'REQUIRED' | 'REQUIRED_FOR_OUT';
export type StockCountApprovalPolicy = 'OPTIONAL' | 'REQUIRED_FOR_DIFFERENCE';

export interface InventoryRules {
  negativeStockPolicy: NegativeStockPolicy;
  reservationPolicy: ReservationPolicy;
  lotSerialPolicy: LotSerialPolicy;
  stockCountApprovalPolicy: StockCountApprovalPolicy;
  defaultCostingMethod: CostingMethod;
}

export interface StockPosition {
  onHand: number;
  reserved: number;
  available: number;
}

export interface StockConsumptionCheck {
  position: StockPosition;
  warning: string | null;
}

export interface StockReorderSuggestion {
  productId: string;
  productCode: string;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
  minStockLevel: number;
  suggestedQuantity: number;
  estimatedDaysToStockout: number | null;
  unitCost: number;
  estimatedCost: number;
}

export type SuggestionPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface SalesVelocity {
  daily30: number;
  daily60: number;
  daily90: number;
  trend: 'ACCELERATING' | 'STABLE' | 'DECELERATING';
}

export interface AdvancedStockSuggestion {
  productId: string;
  productCode: string;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
  minStockLevel: number;
  suggestedQuantity: number;
  estimatedDaysToStockout: number | null;
  unitCost: number;
  estimatedCost: number;
  salesVelocity: SalesVelocity;
  reservationCount: number;
  pendingReservationQty: number;
  priority: SuggestionPriority;
  coverageDays: number | null;
}

const NEGATIVE_STOCK_POLICY_KEY = 'negative_stock_policy';
const LEGACY_NEGATIVE_STOCK_KEY = 'negative_stock';
const RESERVATION_POLICY_KEY = 'reservation_policy';
const LOT_SERIAL_POLICY_KEY = 'lot_serial_policy';
const STOCK_COUNT_APPROVAL_POLICY_KEY = 'stock_count_approval_policy';
const COSTING_METHOD_KEY = 'costing_method';
const DEFAULT_STOCK_LOCATION_CODE = '__DEFAULT__';

function parseNegativeStockPolicy(value: string | null | undefined): NegativeStockPolicy | null {
  if (value === 'ALLOW' || value === 'WARN' || value === 'BLOCK') return value;
  if (value === 'true') return 'ALLOW';
  if (value === 'false') return 'BLOCK';
  return null;
}

function parseReservationPolicy(value: string | null | undefined): ReservationPolicy | null {
  if (value === 'IGNORE' || value === 'RESPECT') return value;
  return null;
}

function parseLotSerialPolicy(value: string | null | undefined): LotSerialPolicy | null {
  if (value === 'OPTIONAL' || value === 'REQUIRED' || value === 'REQUIRED_FOR_OUT') return value;
  return null;
}

function parseStockCountApprovalPolicy(value: string | null | undefined): StockCountApprovalPolicy | null {
  if (value === 'OPTIONAL' || value === 'REQUIRED_FOR_DIFFERENCE') return value;
  return null;
}

function parseCostingMethod(value: string | null | undefined): CostingMethod | null {
  if (
    value === CostingMethod.MOVING_AVERAGE ||
    value === CostingMethod.FIFO ||
    value === CostingMethod.LIFO ||
    value === CostingMethod.STANDARD
  ) {
    return value;
  }
  return null;
}

function quantityValue(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}

export async function getInventoryRules(db: InventoryDbClient, tenantId: string): Promise<InventoryRules> {
  const settings = await db.moduleSetting.findMany({
    where: {
      tenantId,
      module: 'inventory',
      key: {
        in: [
          NEGATIVE_STOCK_POLICY_KEY,
          LEGACY_NEGATIVE_STOCK_KEY,
          RESERVATION_POLICY_KEY,
          LOT_SERIAL_POLICY_KEY,
          STOCK_COUNT_APPROVAL_POLICY_KEY,
          COSTING_METHOD_KEY,
        ],
      },
    },
    select: { key: true, value: true },
  });

  const settingValue = (key: string): string | null | undefined => settings.find((setting) => setting.key === key)?.value;

  return {
    negativeStockPolicy:
      parseNegativeStockPolicy(settingValue(NEGATIVE_STOCK_POLICY_KEY)) ??
      parseNegativeStockPolicy(settingValue(LEGACY_NEGATIVE_STOCK_KEY)) ??
      'ALLOW',
    reservationPolicy: parseReservationPolicy(settingValue(RESERVATION_POLICY_KEY)) ?? 'RESPECT',
    lotSerialPolicy: parseLotSerialPolicy(settingValue(LOT_SERIAL_POLICY_KEY)) ?? 'OPTIONAL',
    stockCountApprovalPolicy:
      parseStockCountApprovalPolicy(settingValue(STOCK_COUNT_APPROVAL_POLICY_KEY)) ?? 'OPTIONAL',
    defaultCostingMethod: parseCostingMethod(settingValue(COSTING_METHOD_KEY)) ?? CostingMethod.MOVING_AVERAGE,
  };
}

export async function resolveStockLevelLocationId(
  db: InventoryDbClient,
  tenantId: string,
  warehouseId: string,
  existingLocationId: string | null | undefined,
): Promise<string> {
  if (existingLocationId) return existingLocationId;

  const location = await db.location.upsert({
    where: {
      warehouseId_code: {
        warehouseId,
        code: DEFAULT_STOCK_LOCATION_CODE,
      },
    },
    create: {
      tenantId,
      warehouseId,
      code: DEFAULT_STOCK_LOCATION_CODE,
      name: 'Varsayilan Lokasyon',
      isActive: true,
    },
    update: {},
    select: { id: true },
  });

  return location.id;
}

export async function getStockPosition(
  db: InventoryDbClient,
  tenantId: string,
  productId: string,
  warehouseId: string,
  excludeReservationRef?: { refType: string; refId: string },
): Promise<StockPosition> {
  const now = new Date();
  await db.inventoryReservation.updateMany({
    where: {
      tenantId,
      productId,
      warehouseId,
      releasedAt: null,
      expiresAt: { lt: now },
    },
    data: { releasedAt: now },
  });

  const [stockLevels, activeReservations] = await Promise.all([
    db.stockLevel.findMany({
      where: { tenantId, productId, warehouseId },
      select: { quantity: true },
    }),
    db.inventoryReservation.findMany({
      where: {
        tenantId,
        productId,
        warehouseId,
        releasedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { quantity: true, refType: true, refId: true },
    }),
  ]);

  const onHand = stockLevels.reduce((sum, level) => sum + quantityValue(level.quantity), 0);
  const reserved = activeReservations
    .filter((reservation) =>
      !excludeReservationRef ||
      reservation.refType !== excludeReservationRef.refType ||
      reservation.refId !== excludeReservationRef.refId,
    )
    .reduce((sum, reservation) => sum + quantityValue(reservation.quantity), 0);

  return { onHand, reserved, available: onHand - reserved };
}

export async function assertCanConsumeStock(
  db: InventoryDbClient,
  tenantId: string,
  input: {
    productId: string;
    warehouseId: string;
    quantity: number;
    lotId?: string | null;
    refType?: string | null;
    refId?: string | null;
  },
): Promise<StockConsumptionCheck> {
  const rules = await getInventoryRules(db, tenantId);
  const position = await getStockPosition(
    db,
    tenantId,
    input.productId,
    input.warehouseId,
    input.refType && input.refId ? { refType: input.refType, refId: input.refId } : undefined,
  );
  const stockBasis = rules.reservationPolicy === 'RESPECT' ? position.available : position.onHand;
  const nextQuantity = stockBasis - input.quantity;

  if (input.lotId) {
    const lot = await db.lotSerialNumber.findFirst({
      where: { id: input.lotId, tenantId, productId: input.productId },
    });
    if (!lot) {
      throw new ValidationError('Geçersiz Lot/Seri numarası.');
    }
  }

  if (
    (rules.lotSerialPolicy === 'REQUIRED' || rules.lotSerialPolicy === 'REQUIRED_FOR_OUT') &&
    !input.lotId
  ) {
    throw new ValidationError('Lot/seri bilgisi zorunludur.');
  }

  const warning = nextQuantity < 0
    ? `Stok eksiye dusecek. Mevcut: ${position.onHand.toFixed(3)}, rezerve: ${position.reserved.toFixed(3)}, kullanilabilir: ${position.available.toFixed(3)}, cikis: ${input.quantity.toFixed(3)}.`
    : null;

  if (rules.negativeStockPolicy === 'BLOCK' && warning) {
    throw new ValidationError(warning);
  }

  return { position, warning };
}

export async function assertCanReserveStock(
  db: InventoryDbClient,
  tenantId: string,
  input: {
    productId: string;
    warehouseId: string;
    quantity: number;
    refType: string;
    refId: string;
  },
): Promise<StockPosition> {
  const position = await getStockPosition(db, tenantId, input.productId, input.warehouseId, {
    refType: input.refType,
    refId: input.refId,
  });
  if (position.available < input.quantity) {
    throw new ValidationError(
      `Rezervasyon icin yeterli stok yok. Kullanilabilir: ${position.available.toFixed(3)}, istenen: ${input.quantity.toFixed(3)}.`,
    );
  }
  return position;
}

export function assertStockCountApproval(input: {
  rules: InventoryRules;
  hasDifference: boolean;
  applyAdjustments: boolean;
  approvalReason?: string | null;
}): void {
  if (
    input.rules.stockCountApprovalPolicy === 'REQUIRED_FOR_DIFFERENCE' &&
    input.applyAdjustments &&
    input.hasDifference &&
    !input.approvalReason?.trim()
  ) {
    throw new ValidationError('Sayim farki onayi icin approvalReason zorunludur.');
  }
}

async function calculateLayerCost(
  db: InventoryDbClient,
  tenantId: string,
  productId: string,
  warehouseId: string,
  qtyRequired: number,
  method: 'FIFO' | 'LIFO',
): Promise<number> {
  const valuations = await db.stockValuation.findMany({
    where: { tenantId, productId, warehouseId },
    orderBy: [
      { date: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  const inLayers: { id: string; qty: number; initialQty: number; unitCost: number }[] = [];

  for (const v of valuations) {
    const qtyIn = Number(v.qtyIn);
    const qtyOut = Number(v.qtyOut);

    if (qtyIn > 0) {
      inLayers.push({
        id: v.id,
        qty: qtyIn,
        initialQty: qtyIn,
        unitCost: Number(v.unitCost),
      });
    }

    if (qtyOut > 0) {
      let remainingOut = qtyOut;
      if (method === 'FIFO') {
        for (const layer of inLayers) {
          if (layer.qty > 0) {
            const consume = Math.min(layer.qty, remainingOut);
            layer.qty -= consume;
            remainingOut -= consume;
            if (remainingOut <= 0) break;
          }
        }
      } else {
        for (let i = inLayers.length - 1; i >= 0; i--) {
          const layer = inLayers[i];
          if (layer.qty > 0) {
            const consume = Math.min(layer.qty, remainingOut);
            layer.qty -= consume;
            remainingOut -= consume;
            if (remainingOut <= 0) break;
          }
        }
      }
    }
  }

  let totalCost = 0;
  let remainingToConsume = qtyRequired;

  const activeLayers = method === 'FIFO' ? inLayers : [...inLayers].reverse();

  for (const layer of activeLayers) {
    if (layer.qty > 0) {
      const consume = Math.min(layer.qty, remainingToConsume);
      totalCost += consume * layer.unitCost;
      remainingToConsume -= consume;
      if (remainingToConsume <= 0) break;
    }
  }

  if (remainingToConsume > 0) {
    const product = await db.product.findFirst({
      where: { id: productId, tenantId },
      select: { averageCost: true, purchasePrice: true },
    });
    const fallbackCost = Number(product?.averageCost ?? product?.purchasePrice ?? 0);
    totalCost += remainingToConsume * fallbackCost;
  }

  return totalCost / qtyRequired;
}

export async function recordInventoryCosting(
  db: InventoryDbClient,
  tenantId: string,
  input: {
    movementId: string;
    productId: string;
    warehouseId: string;
    type: MovementType;
    quantity: number;
    previousQuantity: number;
    quantityChange?: number;
    resultingQuantity?: number;
    unitCost?: number | null;
    date?: Date;
  },
): Promise<void> {
  const rules = await getInventoryRules(db, tenantId);
  const product = await db.product.findFirst({
    where: { id: input.productId, tenantId, deletedAt: null },
    select: { costingMethod: true, averageCost: true, purchasePrice: true },
  });
  if (!product) throw new ValidationError('Urun bulunamadi.');

  const costingMethod = product.costingMethod ?? rules.defaultCostingMethod;
  const currentAverageCost = quantityValue(product.averageCost);
  const purchasePrice = quantityValue(product.purchasePrice);
  const inboundUnitCost = input.unitCost ?? (currentAverageCost > 0 ? currentAverageCost : purchasePrice);
  const defaultChange = input.type === MovementType.IN || input.type === MovementType.OPENING || input.type === MovementType.RETURN
    ? input.quantity
    : -input.quantity;
  const quantityChange = input.quantityChange ?? defaultChange;
  const qtyIn = quantityChange > 0 ? quantityChange : 0;
  const qtyOut = quantityChange < 0 ? Math.abs(quantityChange) : 0;
  const qtyBalance = input.resultingQuantity ?? input.previousQuantity + quantityChange;

  let valuationUnitCost = qtyIn > 0 ? inboundUnitCost : (currentAverageCost > 0 ? currentAverageCost : inboundUnitCost);

  if (qtyOut > 0) {
    if (costingMethod === CostingMethod.FIFO || costingMethod === CostingMethod.LIFO) {
      const calculatedCost = await calculateLayerCost(db, tenantId, input.productId, input.warehouseId, input.quantity, costingMethod);
      await db.stockMovement.update({
        where: { id: input.movementId },
        data: {
          unitCost: calculatedCost,
          totalCost: calculatedCost * input.quantity,
        },
      });
      valuationUnitCost = calculatedCost;
    } else if (costingMethod === CostingMethod.STANDARD) {
      const standardCost = purchasePrice > 0 ? purchasePrice : currentAverageCost;
      await db.stockMovement.update({
        where: { id: input.movementId },
        data: {
          unitCost: standardCost,
          totalCost: standardCost * input.quantity,
        },
      });
      valuationUnitCost = standardCost;
    }
  }

  if (qtyIn > 0) {
    if (
      costingMethod === CostingMethod.MOVING_AVERAGE ||
      costingMethod === CostingMethod.FIFO ||
      costingMethod === CostingMethod.LIFO
    ) {
      const previousValue = Math.max(input.previousQuantity, 0) * currentAverageCost;
      const incomingValue = input.quantity * inboundUnitCost;
      const nextQuantity = Math.max(input.previousQuantity, 0) + input.quantity;
      const nextAverageCost = nextQuantity > 0 ? (previousValue + incomingValue) / nextQuantity : inboundUnitCost;
      await db.product.update({
        where: { id: input.productId },
        data: { averageCost: nextAverageCost },
      });
    } else if (costingMethod === CostingMethod.STANDARD) {
      const standardCost = purchasePrice > 0 ? purchasePrice : currentAverageCost;
      await db.product.update({
        where: { id: input.productId },
        data: { averageCost: standardCost },
      });
    }
  }

  await db.stockValuation.create({
    data: {
      tenantId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      movementId: input.movementId,
      date: input.date ?? new Date(),
      qtyIn,
      qtyOut,
      qtyBalance,
      unitCost: valuationUnitCost,
      totalValue: qtyBalance * valuationUnitCost,
    },
  });
}

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

function determineSalesVelocityTrend(daily30: number, daily60: number, daily90: number): SalesVelocity['trend'] {
  if (daily30 === 0 && daily60 === 0 && daily90 === 0) return 'STABLE';
  const recent = daily30;
  const older = daily90 > 0 ? daily90 : daily60;
  if (older === 0) return recent > 0 ? 'ACCELERATING' : 'STABLE';
  const ratio = recent / older;
  if (ratio > 1.15) return 'ACCELERATING';
  if (ratio < 0.85) return 'DECELERATING';
  return 'STABLE';
}

function determineSuggestionPriority(
  available: number,
  minStockLevel: number,
  estimatedDaysToStockout: number | null,
  reservationRatio: number,
): SuggestionPriority {
  if (available <= 0) return 'CRITICAL';
  if (estimatedDaysToStockout !== null && estimatedDaysToStockout <= 3) return 'CRITICAL';
  if (estimatedDaysToStockout !== null && estimatedDaysToStockout <= 7) return 'HIGH';
  if (available < minStockLevel * 0.5 || reservationRatio > 0.7) return 'HIGH';
  if (available < minStockLevel) return 'MEDIUM';
  return 'LOW';
}

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

export async function processDeliveryNoteStock(
  db: InventoryDbClient,
  tenantId: string,
  deliveryNoteId: string,
): Promise<void> {
  const note = await db.deliveryNote.findFirst({
    where: { id: deliveryNoteId, tenantId },
    include: { items: { include: { product: true } } },
  });
  if (!note) return;

  const activeStatuses: DeliveryNoteStatus[] = ['CONFIRMED', 'SHIPPED', 'DELIVERED'];
  if (!activeStatuses.includes(note.status)) return;

  const existingMovements = await db.stockMovement.findFirst({
    where: { tenantId, refType: 'DELIVERY_NOTE', refId: deliveryNoteId },
  });
  if (existingMovements) return;

  const isOutbound = note.type === 'OUTBOUND' || (note.type === 'RETURN' && note.purchaseOrderId !== null);
  const isInbound = note.type === 'INBOUND' || (note.type === 'RETURN' && note.salesOrderId !== null);

  const mType = isOutbound
    ? (note.type === 'RETURN' ? MovementType.RETURN : MovementType.OUT)
    : (note.type === 'RETURN' ? MovementType.RETURN : MovementType.IN);

  for (const item of note.items) {
    const qty = Number(item.deliveredQty);
    if (qty <= 0) continue;

    const warehouseId = note.warehouseId;
    const existingLevel = await db.stockLevel.findFirst({
      where: { tenantId, productId: item.productId, warehouseId },
    });
    const previousQuantity = Number(existingLevel?.quantity ?? 0);
    const locId = await resolveStockLevelLocationId(db, tenantId, warehouseId, item.locationId ?? existingLevel?.locationId);

    if (isOutbound) {
      await assertCanConsumeStock(db, tenantId, {
        productId: item.productId,
        warehouseId,
        quantity: qty,
        lotId: item.lotId,
        refType: 'DELIVERY_NOTE',
        refId: deliveryNoteId,
      });
    } else {
      const rules = await getInventoryRules(db, tenantId);
      if (rules.lotSerialPolicy === 'REQUIRED' && !item.lotId) {
        throw new ValidationError('Lot/seri bilgisi zorunludur.');
      }
    }

    const movement = await db.stockMovement.create({
      data: {
        tenantId,
        productId: item.productId,
        type: mType,
        quantity: qty,
        lotId: item.lotId ?? null,
        batchId: item.batchId ?? null,
        fromWarehouseId: isOutbound ? warehouseId : null,
        toWarehouseId: isInbound ? warehouseId : null,
        refType: 'DELIVERY_NOTE',
        refId: deliveryNoteId,
        notes: `İrsaliye: ${note.number}`,
      },
    });

    const qtyChange = isOutbound ? -qty : qty;
    await db.stockLevel.upsert({
      where: {
        productId_warehouseId_locationId: {
          productId: item.productId,
          warehouseId,
          locationId: locId,
        },
      },
      create: {
        tenantId,
        productId: item.productId,
        warehouseId,
        locationId: locId,
        quantity: qtyChange,
      },
      update: { quantity: { increment: qtyChange } },
    });

    await recordInventoryCosting(db, tenantId, {
      movementId: movement.id,
      productId: item.productId,
      warehouseId,
      type: mType,
      quantity: qty,
      previousQuantity,
      quantityChange: qtyChange,
      resultingQuantity: previousQuantity + qtyChange,
      date: movement.createdAt,
    });
  }
}
