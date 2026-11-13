import { expect, test } from 'vitest';
import { z } from 'zod';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { data, request } from '../support/http.js';
import { addStock, assertTenantBoundary, stock } from '../support/invariants.js';
import { signedWebhook } from '../support/marketplace.js';

isolatedDatabase();

test('D: signed webhook → SKU → sales order/reservation survives duplicates and out-of-order fulfillment', async () => {
  const { a, b } = await fixture();
  await addStock(a, 10);
  const secret = 'phase3-webhook-signature-secret';
  const integration = await db.marketplaceIntegration.create({ data: { tenantId: a.tenant.id, name: 'Webhook', channel: 'TRENDYOL', apiSecret: secret } });
  const orderTime = Date.now() - 10_000;
  function payload(status: string, lastModifiedDate: number) {
    return { shipmentPackageId: 'package-1', status, orderDate: orderTime, lastModifiedDate,
      customerFirstName: 'Customer', customerEmail: a.contact.email ?? 'marketplace@example.test', packageTotalPrice: 240,
      lines: [{ contentId: a.product.code, productName: a.product.name, quantity: 2, lineUnitPrice: 100, lineGrossAmount: 200 }] };
  }
  async function deliver(body: ReturnType<typeof payload>) {
    return signedWebhook(integration.id, secret, body);
  }
  const initial = payload('Created', orderTime);
  expect((await deliver(initial)).failed).toBe(0);
  expect((await deliver(initial)).duplicate).toBe(1);
  const marketplace = await db.marketplaceOrder.findFirstOrThrow({ where: { tenantId: a.tenant.id, integrationId: integration.id } });
  const resultSchema = z.object({ salesOrderId: z.string(), errors: z.array(z.string()) });
  const retries = await Promise.all([request('POST', `/api/marketplace/orders/${marketplace.id}/automate`, a.identity), request('POST', `/api/marketplace/orders/${marketplace.id}/automate`, a.identity)]);
  const results = retries.map((result) => data(result, 200, resultSchema));
  expect(results[0].salesOrderId).toBe(results[1].salesOrderId);
  expect(results.flatMap((result) => result.errors)).toEqual([]);
  expect(await db.salesOrder.count({ where: { tenantId: a.tenant.id } })).toBe(1);
  expect(await db.inventoryReservation.count({ where: { tenantId: a.tenant.id, refId: results[0].salesOrderId, releasedAt: null } })).toBe(1);
  await deliver(payload('Delivered', orderTime + 2_000));
  await deliver(payload('Picking', orderTime + 1_000));
  expect((await db.marketplaceOrder.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: marketplace.id } })).status).toBe('DELIVERED');
  expect((await stock(a)).toString()).toBe('8');
  expect(await db.deliveryNote.count({ where: { tenantId: a.tenant.id, salesOrderId: results[0].salesOrderId, status: 'DELIVERED' } })).toBe(1);
  expect(await db.inventoryReservation.count({ where: { tenantId: a.tenant.id, refId: results[0].salesOrderId, releasedAt: null } })).toBe(0);
  await deliver(payload('Returned', orderTime + 3_000));
  await deliver(payload('Returned', orderTime + 3_000));
  expect((await stock(a)).toString()).toBe('10');
  expect(await db.stockMovement.count({ where: { tenantId: a.tenant.id, refId: results[0].salesOrderId, type: 'RETURN' } })).toBe(1);
  const gate = data(await request('GET', '/api/stock/truth-gate', a.identity), 200,
    z.object({ checks: z.array(z.object({ key: z.string(), status: z.string() })) }));
  expect(gate.checks.find((check) => check.key === 'sales_delivery')?.status).toBe('PASS');
  await assertTenantBoundary(a, b, `/api/marketplace/orders/${marketplace.id}`);
});

test('D: invalid signature and inactive integration have no order or inventory effects', async () => {
  const { a } = await fixture();
  const integration = await db.marketplaceIntegration.create({ data: { tenantId: a.tenant.id, name: 'Offline provider', channel: 'TRENDYOL', apiSecret: 'secret' } });
  expect((await request('POST', `/api/public/trendyol/webhook/${integration.id}`, null, { shipmentPackageId: 'x' })).status).toBe(401);
  await db.marketplaceIntegration.update({ where: { id: integration.id }, data: { isActive: false } });
  expect((await request('POST', `/api/public/trendyol/webhook/${integration.id}`, null, { shipmentPackageId: 'x' })).status).toBe(404);
  expect(await db.marketplaceOrder.count({ where: { tenantId: a.tenant.id } })).toBe(0);
  expect(await db.salesOrder.count({ where: { tenantId: a.tenant.id } })).toBe(0);
  expect(await db.stockMovement.count({ where: { tenantId: a.tenant.id } })).toBe(0);
});

test('D: insufficient stock is recorded as a failed webhook and replay recovers without duplicate business records', async () => {
  const { a, b } = await fixture();
  await addStock(a, 1);
  const secret = 'replay-recovery-secret';
  const integration = await db.marketplaceIntegration.create({ data: { tenantId: a.tenant.id, name: 'Recovery', channel: 'TRENDYOL', apiSecret: secret } });
  const body = { shipmentPackageId: 'recovery-package', status: 'Created', orderDate: Date.now(), customerFirstName: 'Recovery Customer',
    packageTotalPrice: 240, lines: [{ contentId: a.product.code, productName: a.product.name, quantity: 2, lineUnitPrice: 100 }] };
  expect((await signedWebhook(integration.id, secret, body)).failed).toBe(1);
  const event = await db.marketplaceWebhookEvent.findFirstOrThrow({ where: { tenantId: a.tenant.id, integrationId: integration.id } });
  expect(event.errorMessage).not.toBeNull();
  expect((await stock(a)).toString()).toBe('1');
  expect(await db.inventoryReservation.count({ where: { tenantId: a.tenant.id } })).toBe(0);
  await addStock(a, 2);
  expect((await request('POST', `/api/marketplace/webhook-events/${event.id}/replay`, b.identity)).status).toBe(404);
  const replay = data(await request('POST', `/api/marketplace/webhook-events/${event.id}/replay`, a.identity), 200, z.object({ failed: z.number() }));
  expect(replay.failed).toBe(0);
  expect(await db.salesOrder.count({ where: { tenantId: a.tenant.id } })).toBe(1);
  expect(await db.marketplaceOrder.count({ where: { tenantId: a.tenant.id } })).toBe(1);
  expect(await db.inventoryReservation.count({ where: { tenantId: a.tenant.id, releasedAt: null } })).toBe(1);
  expect((await db.marketplaceWebhookEvent.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: event.id } })).errorMessage).toBeNull();
});

test('D: concurrent cancellation retries release reservations without consuming stock', async () => {
  const { a } = await fixture();
  await addStock(a, 5);
  const secret = 'cancel-retry-secret';
  const integration = await db.marketplaceIntegration.create({ data: { tenantId: a.tenant.id, name: 'Cancellation', channel: 'TRENDYOL', apiSecret: secret } });
  const body = { shipmentPackageId: 'cancel-package', status: 'Created', orderDate: Date.now(), customerFirstName: 'Customer',
    packageTotalPrice: 240, lines: [{ contentId: a.product.code, productName: a.product.name, quantity: 2, lineUnitPrice: 100 }] };
  expect((await signedWebhook(integration.id, secret, body)).failed).toBe(0);
  const cancelled = { ...body, status: 'Cancelled' };
  const results = await Promise.all([signedWebhook(integration.id, secret, cancelled), signedWebhook(integration.id, secret, cancelled)]);
  expect(results.every((result) => result.failed === 0)).toBe(true);
  expect((await stock(a)).toString()).toBe('5');
  expect(await db.inventoryReservation.count({ where: { tenantId: a.tenant.id, releasedAt: null } })).toBe(0);
  expect((await db.salesOrder.findFirstOrThrow({ where: { tenantId: a.tenant.id } })).status).toBe('CANCELLED');
  expect(await db.stockMovement.count({ where: { tenantId: a.tenant.id, type: 'OUT' } })).toBe(0);
});
