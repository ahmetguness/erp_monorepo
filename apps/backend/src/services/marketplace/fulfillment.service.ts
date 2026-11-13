import { MarketplaceOrderStatus, OrderStatus, Prisma, type MarketplaceOrder, type PrismaClient } from '@prisma/client';
import { consumeStock, lockInventoryPosition, recordInventoryCosting, resolveStockLevelLocationId } from '../inventory-rules.service.js';

/** Apply provider fulfillment to ERP inventory in the same transaction as its order state. */
export async function syncMarketplaceFulfillment(db: PrismaClient, tenantId: string, providerOrder: MarketplaceOrder): Promise<void> {
  if (!['CANCELLED', 'DELIVERED', 'RETURNED'].includes(providerOrder.status)) return;
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId + ':fulfillment:' + providerOrder.id}, 0))`;
    const latest = await tx.marketplaceOrder.findFirst({ where: { tenantId, id: providerOrder.id }, select: { status: true } });
    if (!latest || latest.status !== providerOrder.status) return;
    const order = await tx.salesOrder.findFirst({
      where: { tenantId, notes: `Pazaryeri Siparişi #${providerOrder.externalId} (${providerOrder.channel})`, deletedAt: null },
      include: { items: { orderBy: { productId: 'asc' } } },
    });
    if (!order) return;
    const reservations = await tx.inventoryReservation.findMany({ where: { tenantId, refType: 'SALES_ORDER', refId: order.id }, orderBy: { id: 'asc' } });
    if (providerOrder.status === MarketplaceOrderStatus.DELIVERED && order.status !== OrderStatus.DELIVERED) {
      // Release this order's holds inside the same transaction before consuming
      // against its delivery document; other orders' reservations still apply.
      await tx.inventoryReservation.updateMany({ where: { tenantId, refType: 'SALES_ORDER', refId: order.id, releasedAt: null }, data: { releasedAt: new Date() } });
      for (const item of order.items) {
        const remaining = item.quantity.minus(item.delivered);
        if (!remaining.greaterThan(0)) continue;
        const reservation = reservations.find((entry) => entry.productId === item.productId);
        const warehouseId = reservation?.warehouseId ?? (await tx.warehouse.findFirst({ where: { tenantId, isActive: true }, orderBy: { id: 'asc' } }))?.id;
        if (!warehouseId) throw new Error('Marketplace fulfillment requires an active warehouse.');
        const delivery = await tx.deliveryNote.create({ data: {
          tenantId, salesOrderId: order.id, contactId: order.contactId, warehouseId,
          number: `MP-${providerOrder.id}-${item.id}`, type: 'OUTBOUND', status: 'DELIVERED',
          date: new Date(), deliveredAt: new Date(), notes: `Marketplace delivery ${providerOrder.externalId}`,
          items: { create: { tenantId, productId: item.productId, salesOrderItemId: item.id, orderedQty: item.quantity, deliveredQty: remaining } },
        } });
        await consumeStock(tx, tenantId, { productId: item.productId, warehouseId, quantity: remaining,
          refId: delivery.id, refType: 'DELIVERY_NOTE', notes: `Marketplace delivery ${providerOrder.externalId}` });
        await tx.salesOrderItem.updateMany({ where: { tenantId, id: item.id }, data: { delivered: item.quantity } });
      }
      await tx.salesOrder.updateMany({ where: { tenantId, id: order.id }, data: { status: OrderStatus.DELIVERED } });
    }
    if (providerOrder.status === MarketplaceOrderStatus.RETURNED) {
      const deliveries = await tx.deliveryNote.findMany({ where: { tenantId, salesOrderId: order.id, type: 'OUTBOUND', status: 'DELIVERED' }, select: { id: true } });
      for (const item of order.items) {
        if (!item.delivered.greaterThan(0)) continue;
        const key = `marketplace-return:${providerOrder.id}:${item.id}`;
        if (await tx.stockMovement.findFirst({ where: { tenantId, idempotencyKey: key } })) continue;
        const outbound = await tx.stockMovement.findFirst({ where: { tenantId, refType: 'DELIVERY_NOTE', refId: { in: deliveries.map((delivery) => delivery.id) }, productId: item.productId, type: 'OUT' } });
        if (!outbound?.fromWarehouseId) throw new Error('Return requires an ERP delivery movement.');
        const warehouseId = outbound.fromWarehouseId;
        await lockInventoryPosition(tx, tenantId, item.productId, warehouseId);
        const previous = await tx.stockLevel.aggregate({ where: { tenantId, productId: item.productId, warehouseId }, _sum: { quantity: true } });
        const before = previous._sum.quantity ?? new Prisma.Decimal(0);
        const locationId = await resolveStockLevelLocationId(tx, tenantId, warehouseId, undefined);
        await tx.stockLevel.upsert({
          where: { productId_warehouseId_locationId: { productId: item.productId, warehouseId, locationId } },
          create: { tenantId, productId: item.productId, warehouseId, locationId, quantity: item.delivered },
          update: { quantity: { increment: item.delivered } },
        });
        const movement = await tx.stockMovement.create({ data: { tenantId, productId: item.productId, toWarehouseId: warehouseId,
          type: 'RETURN', quantity: item.delivered, refType: 'SALES_ORDER', refId: order.id, idempotencyKey: key,
          unitCost: outbound.unitCost, totalCost: (outbound.unitCost ?? new Prisma.Decimal(0)).mul(item.delivered) } });
        await recordInventoryCosting(tx, tenantId, { movementId: movement.id, productId: item.productId, warehouseId,
          type: 'RETURN', quantity: item.delivered.toNumber(), previousQuantity: before.toNumber(),
          unitCost: outbound.unitCost?.toNumber(), resultingQuantity: before.plus(item.delivered).toNumber() });
      }
    }
    if (providerOrder.status !== MarketplaceOrderStatus.DELIVERED) {
      await tx.salesOrder.updateMany({ where: { tenantId, id: order.id }, data: { status: OrderStatus.CANCELLED } });
    }
    await tx.inventoryReservation.updateMany({ where: { tenantId, refType: 'SALES_ORDER', refId: order.id, releasedAt: null }, data: { releasedAt: new Date() } });
  });
}
