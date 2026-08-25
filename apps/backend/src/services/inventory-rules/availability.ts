import { CostingMethod, MovementType, Prisma, DeliveryNoteStatus, ReservationRefType } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ValidationError } from '../../errors';
import { generateDocumentNumber } from '../../utils/generate-number.js';
import { NEGATIVE_STOCK_POLICY_KEY, LEGACY_NEGATIVE_STOCK_KEY, RESERVATION_POLICY_KEY, LOT_SERIAL_POLICY_KEY, STOCK_COUNT_APPROVAL_POLICY_KEY, COSTING_METHOD_KEY, DEFAULT_STOCK_LOCATION_CODE } from './types.js';
import type { InventoryDbClient, NegativeStockPolicy, ReservationPolicy, LotSerialPolicy, StockCountApprovalPolicy, InventoryRules, StockPosition, StockConsumptionCheck, StockReorderSuggestion, SuggestionPriority, SalesVelocity, AdvancedStockSuggestion } from './types.js';
import { parseNegativeStockPolicy, parseReservationPolicy, parseLotSerialPolicy, parseStockCountApprovalPolicy, parseCostingMethod, quantityValue, getInventoryRules } from './policy.js';
import { calculateLayerCost, recordInventoryCosting } from './costing.js';
import { getReorderSuggestions, determineSalesVelocityTrend, determineSuggestionPriority, getAdvancedStockSuggestions, convertReorderSuggestionsToPurchaseRequest } from './replenishment.js';
import { processDeliveryNoteStock } from './delivery.js';

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

export async function releaseInventoryReservations(
  db: InventoryDbClient,
  tenantId: string,
  input: {
    refType: ReservationRefType;
    refId: string;
    releasedAt?: Date;
  },
): Promise<number> {
  const result = await db.inventoryReservation.updateMany({
    where: {
      tenantId,
      refType: input.refType,
      refId: input.refId,
      releasedAt: null,
    },
    data: { releasedAt: input.releasedAt ?? new Date() },
  });

  return result.count;
}

export async function releaseExpiredInventoryReservations(
  db: InventoryDbClient,
  tenantId: string,
  now: Date = new Date(),
): Promise<number> {
  const result = await db.inventoryReservation.updateMany({
    where: {
      tenantId,
      releasedAt: null,
      expiresAt: { lt: now },
    },
    data: { releasedAt: now },
  });

  return result.count;
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
