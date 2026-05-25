import { CostingMethod, MovementType, Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ValidationError } from '../errors';

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
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
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
  const valuationUnitCost = qtyIn > 0 ? inboundUnitCost : (currentAverageCost > 0 ? currentAverageCost : inboundUnitCost);

  if (qtyIn > 0 && costingMethod === CostingMethod.MOVING_AVERAGE) {
    const previousValue = Math.max(input.previousQuantity, 0) * currentAverageCost;
    const incomingValue = input.quantity * inboundUnitCost;
    const nextQuantity = Math.max(input.previousQuantity, 0) + input.quantity;
    const nextAverageCost = nextQuantity > 0 ? (previousValue + incomingValue) / nextQuantity : inboundUnitCost;
    await db.product.update({
      where: { id: input.productId },
      data: { averageCost: nextAverageCost },
    });
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
