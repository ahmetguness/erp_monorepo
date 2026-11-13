import { MovementType, Prisma, type MovementRefType } from '@prisma/client';
import { ValidationError } from '../../errors/index.js';
import { assertCanConsumeStock, lockInventoryPosition, resolveStockLevelLocationId } from './availability.js';
import { recordInventoryCosting } from './costing.js';

interface StockConsumption {
  readonly productId: string;
  readonly warehouseId: string;
  readonly quantity: Prisma.Decimal;
  readonly refId: string;
  readonly refType?: MovementRefType;
  readonly notes: string;
}

/** Must run inside the caller's business transaction so stock, costing and invoice commit together. */
export async function consumeStock(tx: Prisma.TransactionClient, tenantId: string, input: StockConsumption): Promise<void> {
  if (!input.quantity.greaterThan(0)) throw new ValidationError('Stock consumption must be positive.');
  await lockInventoryPosition(tx, tenantId, input.productId, input.warehouseId);
  const { position } = await assertCanConsumeStock(tx, tenantId, {
    ...input, quantity: input.quantity.toNumber(), refType: input.refType ?? 'OTHER',
  });
  const levels = await tx.stockLevel.findMany({
    where: { tenantId, productId: input.productId, warehouseId: input.warehouseId }, orderBy: { locationId: 'asc' },
  });
  let remaining = input.quantity;
  for (const level of levels) {
    if (remaining.isZero()) break;
    const used = Prisma.Decimal.min(remaining, Prisma.Decimal.max(level.quantity, 0));
    if (used.isZero()) continue;
    await tx.stockLevel.updateMany({ where: { id: level.id, tenantId }, data: { quantity: { decrement: used } } });
    remaining = remaining.minus(used);
  }
  // Existing ALLOW/WARN policy may permit an overdraft. Preserve that policy
  // explicitly, rather than silently dropping the unmatched quantity.
  if (remaining.greaterThan(0)) {
    const locationId = await resolveStockLevelLocationId(tx, tenantId, input.warehouseId, undefined);
    await tx.stockLevel.upsert({
      where: { productId_warehouseId_locationId: { productId: input.productId, warehouseId: input.warehouseId, locationId } },
      create: { tenantId, productId: input.productId, warehouseId: input.warehouseId, locationId, quantity: remaining.negated() },
      update: { quantity: { decrement: remaining } },
    });
  }
  const product = await tx.product.findFirstOrThrow({ where: { id: input.productId, tenantId }, select: { averageCost: true, purchasePrice: true } });
  const unitCost = product.averageCost.greaterThan(0) ? product.averageCost : product.purchasePrice;
  const movement = await tx.stockMovement.create({ data: {
    tenantId, productId: input.productId, fromWarehouseId: input.warehouseId, type: MovementType.OUT,
    quantity: input.quantity, unitCost, totalCost: unitCost.mul(input.quantity), refType: input.refType ?? 'OTHER', refId: input.refId, notes: input.notes,
  } });
  await recordInventoryCosting(tx, tenantId, { movementId: movement.id, productId: input.productId, warehouseId: input.warehouseId,
    type: MovementType.OUT, quantity: input.quantity.toNumber(), previousQuantity: position.onHand,
    resultingQuantity: new Prisma.Decimal(position.onHand).minus(input.quantity).toNumber(), date: movement.createdAt });
}
