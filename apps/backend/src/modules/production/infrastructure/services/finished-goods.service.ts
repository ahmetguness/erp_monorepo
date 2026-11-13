import { Prisma, type WorkOrder } from '@prisma/client';
import { lockInventoryPosition, recordInventoryCosting, resolveStockLevelLocationId } from '../../../../services/inventory-rules.service.js';

/** Caller must hold the work-order row lock and commit output together with completion/accounting. */
export async function recordFinishedGoods(tx: Prisma.TransactionClient, tenantId: string, order: WorkOrder): Promise<void> {
  const warehouseId = order.outputWarehouseId;
  if (!warehouseId || !order.producedQty.greaterThan(0)) return;
  await lockInventoryPosition(tx, tenantId, order.productId, warehouseId);
  const existing = await tx.stockLevel.aggregate({ where: { tenantId, productId: order.productId, warehouseId }, _sum: { quantity: true } });
  const previousQuantity = existing._sum.quantity ?? new Prisma.Decimal(0);
  const totalCost = Prisma.Decimal.max(0, new Prisma.Decimal(order.actualMaterialCost ?? 0).plus(order.actualLaborCost ?? 0).plus(order.actualOverheadCost ?? 0).minus(order.scrapCost ?? 0));
  const unitCost = totalCost.div(order.producedQty).toDecimalPlaces(4);
  const locationId = await resolveStockLevelLocationId(tx, tenantId, warehouseId, undefined);
  const movement = await tx.stockMovement.create({ data: {
    tenantId, productId: order.productId, type: 'IN', quantity: order.producedQty, unitCost, totalCost,
    toWarehouseId: warehouseId, refType: 'WORK_ORDER', refId: order.id, notes: `Production output: ${order.number}`,
  } });
  await tx.stockLevel.upsert({
    where: { productId_warehouseId_locationId: { productId: order.productId, warehouseId, locationId } },
    create: { tenantId, productId: order.productId, warehouseId, locationId, quantity: order.producedQty },
    update: { quantity: { increment: order.producedQty } },
  });
  await recordInventoryCosting(tx, tenantId, { movementId: movement.id, productId: order.productId, warehouseId, type: 'IN',
    quantity: order.producedQty.toNumber(), unitCost: unitCost.toNumber(), previousQuantity: previousQuantity.toNumber(),
    resultingQuantity: previousQuantity.plus(order.producedQty).toNumber(), date: movement.createdAt });
}
