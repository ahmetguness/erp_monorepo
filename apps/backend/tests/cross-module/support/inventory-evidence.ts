import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { db } from './database.js';
import type { TenantFixture } from './fixtures.js';
import { create, request } from './http.js';
import { signedWebhook } from './marketplace.js';

/** Exercise the remaining inventory operations before enabling the HTTP MRP gate.
 * Production consumption/output and reservation/release come from the caller's work order.
 */
export async function exerciseInventoryEvidence(a: TenantFixture): Promise<void> {
  await create('/api/stock/movements', a.identity, { idempotencyKey: randomUUID(), productId: a.product.id,
    warehouseId: a.warehouse.id, type: 'OPENING', quantity: 1, unitCost: 40 });
  const adjustment = await db.product.create({ data: { tenantId: a.tenant.id, unitId: a.unit.id, code: 'COUNTED', name: 'Counted product' } });
  await create('/api/stock/movements', a.identity, { idempotencyKey: randomUUID(), productId: adjustment.id,
    warehouseId: a.warehouse.id, type: 'ADJUSTMENT', quantity: 1, unitCost: 40 });
  await db.lotSerialNumber.create({ data: { tenantId: a.tenant.id, productId: a.product.id, serialNumber: 'UNUSED-SERIAL' } });
  const warehouseId = await create('/api/warehouses', a.identity, { code: 'SECOND', name: 'Transfer destination' });
  expect((await request('POST', '/api/warehouses/transfer', a.identity, { productId: a.product.id,
    fromWarehouseId: a.warehouse.id, toWarehouseId: warehouseId, quantity: 1 })).status).toBe(201);
  const orderId = await create('/api/purchase-orders', a.identity, { contactId: a.contact.id, date: '2026-11-01',
    items: [{ productId: a.product.id, quantity: 1, unitPrice: 40 }] });
  expect((await request('POST', `/api/purchase-orders/${orderId}/send`, a.identity)).status).toBe(200);
  const item = await db.purchaseOrderItem.findFirstOrThrow({ where: { tenantId: a.tenant.id, orderId } });
  expect((await request('POST', `/api/purchase-orders/${orderId}/receive`, a.identity, { idempotencyKey: randomUUID(),
    warehouseId: a.warehouse.id, items: [{ itemId: item.id, receivedQty: 1 }] })).status).toBe(200);
  const salesOrderId = await create('/api/sales-orders', a.identity, { contactId: a.contact.id, date: '2026-11-01',
    items: [{ productId: a.product.id, quantity: 1, unitPrice: 100 }] });
  const salesItem = await db.salesOrderItem.findFirstOrThrow({ where: { tenantId: a.tenant.id, orderId: salesOrderId } });
  const deliveryId = await create('/api/delivery-notes', a.identity, { contactId: a.contact.id, salesOrderId, warehouseId: a.warehouse.id,
    type: 'OUTBOUND', date: '2026-11-01', items: [{ productId: a.product.id, salesOrderItemId: salesItem.id, orderedQty: 1, deliveredQty: 1 }] });
  expect((await request('PATCH', `/api/delivery-notes/${deliveryId}/status`, a.identity, { status: 'DELIVERED' })).status).toBe(200);
  const secret = 'inventory-evidence-webhook-secret';
  const integration = await db.marketplaceIntegration.create({ data: { tenantId: a.tenant.id, name: 'Inventory evidence', channel: 'TRENDYOL', apiSecret: secret } });
  const orderDate = Date.now();
  const body = { shipmentPackageId: 'inventory-return', orderDate, customerFirstName: 'Return customer', packageTotalPrice: 100,
    lines: [{ contentId: a.product.code, productName: a.product.name, quantity: 1, lineUnitPrice: 100 }] };
  for (const [index, status] of ['Created', 'Delivered', 'Returned'].entries()) {
    expect((await signedWebhook(integration.id, secret, { ...body, status, lastModifiedDate: orderDate + index })).failed).toBe(0);
  }
}
