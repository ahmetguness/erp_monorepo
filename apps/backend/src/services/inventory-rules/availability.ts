import type { ReservationRefType } from '@prisma/client';
import { ValidationError } from '../../errors';
import { DEFAULT_STOCK_LOCATION_CODE } from './types.js';
import type { InventoryDbClient, InventoryRules, StockPosition, StockConsumptionCheck } from './types.js';
import { quantityValue, getInventoryRules } from './policy.js';

/** Serialize availability decisions for one tenant/product/warehouse inside a DB transaction. */
export async function lockInventoryPosition(
  db: InventoryDbClient,
  tenantId: string,
  productId: string,
  warehouseId: string,
): Promise<void> {
  const key = `${tenantId}:${productId}:${warehouseId}`;
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
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

export async function releaseInventoryReservationQuantity(
  db: InventoryDbClient,
  tenantId: string,
  input: {
    refType: ReservationRefType;
    refId: string;
    productId: string;
    warehouseId: string;
    quantity: number;
    releasedAt?: Date;
  },
): Promise<number> {
  let remaining = input.quantity;
  if (remaining <= 0) return 0;
  const releasedAt = input.releasedAt ?? new Date();
  const reservations = await db.inventoryReservation.findMany({
    where: {
      tenantId,
      refType: input.refType,
      refId: input.refId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      releasedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: releasedAt } }],
    },
    orderBy: { reservedAt: 'asc' },
  });

  let releasedQuantity = 0;
  for (const reservation of reservations) {
    if (remaining <= 0) break;
    const quantity = quantityValue(reservation.quantity);
    const consumed = Math.min(quantity, remaining);
    if (consumed === quantity) {
      await db.inventoryReservation.update({ where: { id: reservation.id }, data: { releasedAt } });
    } else {
      await db.inventoryReservation.update({ where: { id: reservation.id }, data: { quantity: quantity - consumed } });
      await db.inventoryReservation.create({
        data: {
          tenantId,
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
          quantity: consumed,
          refType: reservation.refType,
          refId: reservation.refId,
          notes: reservation.notes,
          reservedAt: reservation.reservedAt,
          expiresAt: reservation.expiresAt,
          releasedAt,
          createdById: reservation.createdById,
        },
      });
    }
    releasedQuantity += consumed;
    remaining -= consumed;
  }
  return releasedQuantity;
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
