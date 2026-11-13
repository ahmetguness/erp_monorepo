import type { PrismaClient } from '@prisma/client';
import { canAdvanceMarketplaceOrder } from '../../domain/order-status.policy.js';
import type { WebhookOrderPackage } from '../../domain/webhook-order.types.js';

export async function upsertMarketplaceOrder(
  db: PrismaClient,
  tenantId: string,
  integrationId: string,
  orderPackage: WebhookOrderPackage,
): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId + ':' + integrationId + ':' + orderPackage.packageId}, 0))`;
    const existing = await tx.marketplaceOrder.findFirst({
      where: { tenantId, integrationId, externalId: orderPackage.packageId },
      select: { id: true, status: true },
    });
  
    if (existing && !canAdvanceMarketplaceOrder(existing.status, orderPackage.status)) return existing;
  
    if (existing) {
      const updated = await tx.marketplaceOrder.update({
        where: { id: existing.id },
        data: {
          status: orderPackage.status,
          customerName: orderPackage.customerName,
          customerEmail: orderPackage.customerEmail,
          customerPhone: orderPackage.customerPhone,
          shippingAddress: orderPackage.shippingAddress,
          totalAmount: orderPackage.totalAmount,
          orderDate: orderPackage.orderDate,
          syncedAt: new Date(),
          updatedAt: new Date(),
        },
        select: { id: true },
      });
      return updated;
    }
  
    const created = await tx.marketplaceOrder.create({
      data: {
        tenantId,
        integrationId,
        externalId: orderPackage.packageId,
        channel: 'TRENDYOL',
        status: orderPackage.status,
        customerName: orderPackage.customerName,
        customerEmail: orderPackage.customerEmail,
        customerPhone: orderPackage.customerPhone,
        shippingAddress: orderPackage.shippingAddress,
        totalAmount: orderPackage.totalAmount,
        orderDate: orderPackage.orderDate,
        syncedAt: new Date(),
        items: {
          create: orderPackage.lines.map((line) => ({
            tenantId,
            externalProductId: line.contentId,
            name: line.productName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
          })),
        },
      },
      select: { id: true },
    });
  
    return created;
  });
}
