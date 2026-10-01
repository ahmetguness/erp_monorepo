import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const base = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_MARKETPLACE_AUTOMATION_${Date.now()}`;
type Session = { cookie: string; tenantId: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug }) });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  return { cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', tenantId: body.data.tenant.id };
}
async function api(session: Session | null, path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${base}/api/marketplace${path}`, { method, headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) as any };
}

async function main() {
  const owner = await login('admin@axondemo.com', 'axon-demo');
  const denied = await login('muhasebe@axondemo.com', 'axon-demo');
  const foreign = await login('pro@axondemo.com', 'axon-pro-demo');
  const originalNotes = (await prisma.tenant.findUniqueOrThrow({ where: { id: owner.tenantId }, select: { notes: true } })).notes;
  let productId = '', orderId = '', recoveryProductId = '', recoveryOrderId = '', listingId = '';
  let integrationId = '', integrationCredentials: { apiKey: string | null; apiSecret: string | null; storeId: string | null } | null = null;
  const salesOrderIds: string[] = [], contactIds: string[] = [];
  try {
    assert.equal((await api(null, '/automation/summary')).status, 401);
    assert.equal((await api(denied, '/automation/summary')).status, 403);
    assert.equal((await api(owner, '/automation/policy')).status, 200);
    for (const body of [{}, { unknown: true }, { autoCreateContact: 'yes' }, [], null]) assert.equal((await api(owner, '/automation/policy', 'POST', body)).status, 400, JSON.stringify(body));

    assert.equal((await api(owner, '/automation/policy', 'POST', { autoCreateContact: true, autoCreateSalesOrder: true, autoReserveStock: true, autoSyncErpStockToMarketplace: false })).status, 200);
    const concurrentPolicy = await Promise.all([
      api(owner, '/automation/policy', 'POST', { autoCreateContact: false }),
      api(owner, '/automation/policy', 'POST', { autoSyncErpStockToMarketplace: true }),
    ]);
    assert.deepEqual(concurrentPolicy.map((entry) => entry.status), [200, 200]);
    const policy = (await api(owner, '/automation/policy')).body.data;
    assert.equal(policy.autoCreateContact, false);
    assert.equal(policy.autoSyncErpStockToMarketplace, true);
    assert.equal(Object.keys(policy).length, 5);
    await api(owner, '/automation/policy', 'POST', { autoCreateContact: true });

    const integration = await prisma.marketplaceIntegration.findFirstOrThrow({ where: { tenantId: owner.tenantId, isActive: true } });
    integrationId = integration.id;
    integrationCredentials = { apiKey: integration.apiKey, apiSecret: integration.apiSecret, storeId: integration.storeId };
    const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: owner.tenantId } });
    const product = await prisma.product.create({ data: { tenantId: owner.tenantId, unitId: unit.id, code: `${marker}_SKU`, barcode: `${marker}_BAR`, name: `${marker} Ürün`, salesPrice: 100 } });
    productId = product.id;
    const warehouses = await prisma.warehouse.findMany({ where: { tenantId: owner.tenantId, isActive: true, locations: { some: { isActive: true } } }, select: { id: true, locations: { where: { isActive: true }, take: 1, select: { id: true } } } });
    assert.ok(warehouses.length > 0);
    await prisma.stockLevel.createMany({ data: warehouses.map((warehouse) => ({ tenantId: owner.tenantId, productId, warehouseId: warehouse.id, locationId: warehouse.locations[0].id, quantity: 10 })) });
    const order = await prisma.marketplaceOrder.create({ data: { tenantId: owner.tenantId, integrationId: integration.id, externalId: marker, channel: integration.channel, status: 'PENDING', customerName: `${marker} Müşteri`, customerEmail: `${Date.now()}@example.test`, totalAmount: 200, orderDate: new Date(), items: { create: [{ tenantId: owner.tenantId, externalProductId: product.code, name: product.name, quantity: 2, unitPrice: 100, lineTotal: 200 }] } } });
    orderId = order.id;

    const before = await api(owner, '/automation/summary');
    assert.equal(before.status, 200);
    assert.ok(before.body.data.unmatchedSkuCount >= 1);
    assert.equal((await api(foreign, `/orders/${orderId}/automate`, 'POST')).status >= 400, true);
    assert.equal((await api(owner, '/orders/missing/automate', 'POST')).status >= 400, true);

    const runs = await Promise.all([api(owner, `/orders/${orderId}/automate`, 'POST'), api(owner, `/orders/${orderId}/automate`, 'POST')]);
    assert.deepEqual(runs.map((entry) => entry.status), [200, 200]);
    assert.deepEqual(runs.map((entry) => entry.body.data.errors), [[], []]);
    for (const run of runs.filter((entry) => entry.status === 200)) {
      if (run.body.data.salesOrderId) salesOrderIds.push(run.body.data.salesOrderId);
      if (run.body.data.contactId) contactIds.push(run.body.data.contactId);
    }
    const uniqueSalesOrders = [...new Set(salesOrderIds)];
    const uniqueContacts = [...new Set(contactIds)];
    assert.equal(uniqueSalesOrders.length, 1);
    assert.equal(await prisma.salesOrder.count({ where: { id: { in: uniqueSalesOrders } } }), 1);
    const salesOrder = await prisma.salesOrder.findUniqueOrThrow({ where: { id: uniqueSalesOrders[0] }, include: { items: true } });
    assert.deepEqual({ net: Number(salesOrder.totalNet), tax: Number(salesOrder.totalTax), gross: Number(salesOrder.totalGross), lines: salesOrder.items.length }, { net: 200, tax: 40, gross: 240, lines: 1 });
    const reservations = await prisma.inventoryReservation.findMany({ where: { tenantId: owner.tenantId, refId: salesOrder.id } });
    assert.equal(reservations.length, 1);
    assert.equal(Number(reservations[0].quantity), 2);
    assert.equal((await prisma.marketplaceOrderItem.findFirstOrThrow({ where: { marketplaceOrderId: orderId } })).productId, productId);
    const after = await api(owner, '/automation/summary');
    assert.equal(after.status, 200);
    assert.equal(after.body.data.unmatchedSkuCount, before.body.data.unmatchedSkuCount - 1);
    assert.equal((await api(owner, `/products/${productId}/sync-stock`, 'POST')).status, 200);
    assert.deepEqual((await api(owner, '/products/missing/sync-stock', 'POST')).body.data, { syncedListings: 0, errors: ['Product not found'] });
    const listing = await prisma.marketplaceListing.create({ data: { tenantId: owner.tenantId, integrationId: integration.id, productId, externalId: `${marker}_LISTING`, externalSku: product.barcode, price: 100, stock: 10 } });
    listingId = listing.id;
    const stockBeforeFailure = await prisma.stockLevel.aggregate({ where: { productId }, _sum: { quantity: true } });
    const reservationsBeforeFailure = await prisma.inventoryReservation.count({ where: { refId: salesOrder.id, releasedAt: null } });
    await prisma.marketplaceIntegration.update({ where: { id: integration.id }, data: { apiKey: null, apiSecret: null, storeId: null } });
    const failedSync = await api(owner, `/products/${productId}/sync-stock`, 'POST');
    assert.equal(failedSync.status, 200);
    assert.equal(failedSync.body.data.syncedListings, 0);
    assert.equal(failedSync.body.data.errors.length, 1);
    assert.equal(Number((await prisma.stockLevel.aggregate({ where: { productId }, _sum: { quantity: true } }))._sum.quantity), Number(stockBeforeFailure._sum.quantity));
    assert.equal(await prisma.inventoryReservation.count({ where: { refId: salesOrder.id, releasedAt: null } }), reservationsBeforeFailure);
    await prisma.marketplaceIntegration.update({ where: { id: integration.id }, data: { apiKey: 'test-key', apiSecret: 'test-secret', storeId: '12345' } });
    const successfulSync = await api(owner, `/products/${productId}/sync-stock`, 'POST');
    assert.equal(successfulSync.status, 200);
    assert.equal(successfulSync.body.data.errors.length, 0, JSON.stringify(successfulSync.body.data));

    const recoveryProduct = await prisma.product.create({ data: { tenantId: owner.tenantId, unitId: unit.id, code: `${marker}_RECOVERY_SKU`, name: `${marker} Recovery Ürün`, salesPrice: 50 } });
    recoveryProductId = recoveryProduct.id;
    await prisma.stockLevel.createMany({ data: warehouses.map((warehouse) => ({ tenantId: owner.tenantId, productId: recoveryProduct.id, warehouseId: warehouse.id, locationId: warehouse.locations[0].id, quantity: 2 })) });
    const recoveryOrder = await prisma.marketplaceOrder.create({ data: { tenantId: owner.tenantId, integrationId: integration.id, externalId: `${marker}_RECOVERY`, channel: integration.channel, status: 'PENDING', customerName: `${marker} Recovery Müşteri`, customerEmail: `recovery-${Date.now()}@example.test`, totalAmount: 250, orderDate: new Date(), items: { create: [{ tenantId: owner.tenantId, externalProductId: recoveryProduct.code, name: recoveryProduct.name, quantity: 5, unitPrice: 50, lineTotal: 250 }] } } });
    recoveryOrderId = recoveryOrder.id;
    const failedReservation = await api(owner, `/orders/${recoveryOrder.id}/automate`, 'POST');
    assert.equal(failedReservation.status, 200);
    assert.equal(failedReservation.body.data.errors.some((message: string) => message.includes('rezervasyon')), true);
    const partialSalesOrderId = failedReservation.body.data.salesOrderId as string;
    salesOrderIds.push(partialSalesOrderId);
    contactIds.push(failedReservation.body.data.contactId);
    assert.equal(await prisma.inventoryReservation.count({ where: { refId: partialSalesOrderId, releasedAt: null } }), 0);
    assert.equal(await prisma.salesOrder.count({ where: { id: partialSalesOrderId } }), 1);
    assert.equal(await prisma.salesOrderItem.count({ where: { orderId: partialSalesOrderId } }), 1);
    await prisma.stockLevel.updateMany({ where: { productId: recoveryProduct.id }, data: { quantity: 10 } });
    const recoveryRuns = await Promise.all([api(owner, `/orders/${recoveryOrder.id}/automate`, 'POST'), api(owner, `/orders/${recoveryOrder.id}/automate`, 'POST')]);
    assert.deepEqual(recoveryRuns.map((entry) => entry.body.data.errors), [[], []]);
    assert.equal(new Set(recoveryRuns.map((entry) => entry.body.data.salesOrderId)).size, 1);
    assert.equal(await prisma.salesOrder.count({ where: { id: partialSalesOrderId } }), 1);
    assert.equal(await prisma.salesOrderItem.count({ where: { orderId: partialSalesOrderId } }), 1);
    const recoveryReservations = await prisma.inventoryReservation.findMany({ where: { refId: partialSalesOrderId, releasedAt: null } });
    assert.equal(recoveryReservations.length, 1);
    assert.equal(Number(recoveryReservations[0].quantity), 5);
    assert.equal(await prisma.contact.count({ where: { tenantId: owner.tenantId, email: recoveryOrder.customerEmail } }), 1);
    console.log('PASS marketplace automation assurance: auth, strict policy validation, concurrent policy merge, order pipeline, SKU match, sales math, reservation idempotency, summaries, stock sync and tenant isolation');
  } finally {
    if (integrationId && integrationCredentials) await prisma.marketplaceIntegration.update({ where: { id: integrationId }, data: integrationCredentials });
    const linkedOrders = salesOrderIds.length ? [...new Set(salesOrderIds)] : (orderId ? (await prisma.salesOrder.findMany({ where: { tenantId: owner.tenantId, notes: { contains: marker } }, select: { id: true } })).map((row) => row.id) : []);
    if (linkedOrders.length) { await prisma.inventoryReservation.deleteMany({ where: { refId: { in: linkedOrders } } }); await prisma.salesOrderItem.deleteMany({ where: { orderId: { in: linkedOrders } } }); await prisma.salesOrder.deleteMany({ where: { id: { in: linkedOrders } } }); }
    if (listingId) await prisma.marketplaceListing.deleteMany({ where: { id: listingId } });
    if (orderId || recoveryOrderId) await prisma.marketplaceOrder.deleteMany({ where: { id: { in: [orderId, recoveryOrderId].filter(Boolean) } } });
    const markerContacts = await prisma.contact.findMany({ where: { tenantId: owner.tenantId, OR: [{ name: { startsWith: marker } }, { id: { in: contactIds } }] }, select: { id: true } });
    if (markerContacts.length) await prisma.contact.deleteMany({ where: { id: { in: markerContacts.map((row) => row.id) } } });
    if (productId || recoveryProductId) await prisma.product.deleteMany({ where: { id: { in: [productId, recoveryProductId].filter(Boolean) } } });
    await prisma.tenant.update({ where: { id: owner.tenantId }, data: { notes: originalNotes } });
    assert.equal(await prisma.marketplaceOrder.count({ where: { externalId: marker } }), 0);
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
