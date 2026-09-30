import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { getStockPosition, processDeliveryNoteStock } from '../src/services/inventory-rules.service.js';

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_RESERVATION_${Date.now()}`;
type Session = { cookie: string; tenantId: string };
async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug }) });
  assert.equal(response.status, 200); const body = (await response.json()) as any;
  return { cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', tenantId: body.data.tenant.id };
}
async function api(session: Session | null, method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text(); return { status: response.status, body: text ? JSON.parse(text) : null };
}
function reservation(productId: string, warehouseId: string, quantity: number, refId: string, extra: Record<string, unknown> = {}) {
  return { productId, warehouseId, quantity, refType: 'OTHER', refId, allowPartial: false, ...extra };
}
async function main() {
  const owner = await login('admin@axondemo.com', 'axon-demo');
  const warehouseUser = await login('depo@axondemo.com', 'axon-demo');
  const unauthorized = await login('muhasebe@axondemo.com', 'axon-demo');
  const foreign = await login('starter@axondemo.com', 'axon-starter-demo');
  let productId = '', warehouseAId = '', warehouseBId = '', orderId = '', cancelOrderId = '', foreignOrderId = '';
  const noteIds: string[] = [];
  try {
    assert.equal((await api(null, 'GET', '/api/inventory-reservations')).status, 401);
    assert.equal((await api(null, 'GET', '/api/inventory-reservations/report')).status, 401);
    assert.equal((await api(unauthorized, 'POST', '/api/inventory-reservations', {})).status, 403);
    assert.equal((await api(unauthorized, 'GET', '/api/inventory-reservations')).status, 403);
    for (const query of ['page=0', 'page=x', 'limit=0', 'limit=101', 'refType=INVALID', 'active=x', 'status=INVALID']) {
      assert.equal((await api(owner, 'GET', `/api/inventory-reservations?${query}`)).status, 400, query);
    }
    const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: owner.tenantId } });
    const [warehouseA, warehouseB] = await Promise.all([
      prisma.warehouse.create({ data: { tenantId: owner.tenantId, code: `${marker}_A`, name: `${marker} A` } }),
      prisma.warehouse.create({ data: { tenantId: owner.tenantId, code: `${marker}_B`, name: `${marker} B` } }),
    ]); warehouseAId = warehouseA.id; warehouseBId = warehouseB.id;
    const product = await prisma.product.create({ data: { tenantId: owner.tenantId, unitId: unit.id, code: `${marker}_P`, name: `${marker} Product` } }); productId = product.id;
    await prisma.location.createMany({ data: [
      { tenantId: owner.tenantId, warehouseId: warehouseAId, code: `${marker}_LA`, name: 'Default A' },
      { tenantId: owner.tenantId, warehouseId: warehouseBId, code: `${marker}_LB`, name: 'Default B' },
    ] });
    const locations = await prisma.location.findMany({ where: { warehouseId: { in: [warehouseAId, warehouseBId] } } });
    await prisma.stockLevel.createMany({ data: [
      { tenantId: owner.tenantId, productId, warehouseId: warehouseAId, locationId: locations.find(x => x.warehouseId === warehouseAId)!.id, quantity: 10 },
      { tenantId: owner.tenantId, productId, warehouseId: warehouseBId, locationId: locations.find(x => x.warehouseId === warehouseBId)!.id, quantity: 20 },
    ] });
    assert.deepEqual(await getStockPosition(prisma, owner.tenantId, productId, warehouseAId), { onHand: 10, reserved: 0, available: 10 });

    for (const payload of [
      reservation(productId, warehouseAId, 0, `${marker}_ZERO`),
      reservation(productId, warehouseAId, -1, `${marker}_NEGATIVE`),
      reservation(productId, warehouseAId, 0.0001, `${marker}_SCALE`),
      reservation(productId, warehouseAId, 1e15, `${marker}_HUGE`),
      { ...reservation(productId, warehouseAId, 1, `${marker}_TYPE`), refType: 'INVALID' },
      { ...reservation(productId, warehouseAId, 1, `${marker}_BOOL`), allowPartial: 'yes' },
      { ...reservation(productId, warehouseAId, 1, `${marker}_DATE`), expiresAt: 'bad' },
      { ...reservation(productId, warehouseAId, 1, `${marker}_PAST`), expiresAt: '2020-01-01' },
      reservation(productId, warehouseAId, 1, 'X'.repeat(201)),
      { ...reservation(productId, warehouseAId, 1, `${marker}_NOTES`), notes: 'X'.repeat(2001) },
    ]) assert.equal((await api(owner, 'POST', '/api/inventory-reservations', payload)).status, 400);

    const basic = await api(warehouseUser, 'POST', '/api/inventory-reservations', reservation(productId, warehouseAId, 4, `${marker}_BASIC`));
    assert.equal(basic.status, 201, JSON.stringify(basic.body));
    assert.deepEqual(await getStockPosition(prisma, owner.tenantId, productId, warehouseAId), { onHand: 10, reserved: 4, available: 6 });
    const listed = await api(owner, 'GET', `/api/inventory-reservations?status=active&search=${marker}_BASIC`);
    assert.equal(listed.status, 200); assert.equal(listed.body.meta.total, 1); assert.equal(listed.body.data[0].id, basic.body.data.id);
    const report = await api(owner, 'GET', '/api/inventory-reservations/report');
    assert.equal(report.status, 200);
    const reportRow = report.body.data.rows.find((row: any) => row.productId === productId && row.warehouseId === warehouseAId);
    assert.equal(Number(reportRow.activeQuantity), 4);
    assert.equal(Number((await prisma.stockLevel.findFirstOrThrow({ where: { productId, warehouseId: warehouseAId } })).quantity), 10);
    const duplicate = await api(warehouseUser, 'POST', '/api/inventory-reservations', reservation(productId, warehouseAId, 4, `${marker}_BASIC`));
    assert.equal(duplicate.status, 201); assert.equal(duplicate.body.data.id, basic.body.data.id);
    assert.equal(await prisma.inventoryReservation.count({ where: { productId, refId: `${marker}_BASIC`, releasedAt: null } }), 1);
    assert.equal((await api(warehouseUser, 'POST', `/api/inventory-reservations/${basic.body.data.id}/release`)).status, 200);
    const releasedAt = (await prisma.inventoryReservation.findUniqueOrThrow({ where: { id: basic.body.data.id } })).releasedAt;
    assert.equal((await api(warehouseUser, 'POST', `/api/inventory-reservations/${basic.body.data.id}/release`)).status, 200);
    assert.equal((await prisma.inventoryReservation.findUniqueOrThrow({ where: { id: basic.body.data.id } })).releasedAt?.getTime(), releasedAt?.getTime());
    assert.deepEqual(await getStockPosition(prisma, owner.tenantId, productId, warehouseAId), { onHand: 10, reserved: 0, available: 10 });

    const concurrent = await Promise.all([
      api(warehouseUser, 'POST', '/api/inventory-reservations', reservation(productId, warehouseAId, 7, `${marker}_RACE_A`)),
      api(warehouseUser, 'POST', '/api/inventory-reservations', reservation(productId, warehouseAId, 7, `${marker}_RACE_B`)),
    ]);
    assert.deepEqual(concurrent.map(x => x.status).sort(), [201, 400]);
    const raced = await getStockPosition(prisma, owner.tenantId, productId, warehouseAId);
    assert.equal(raced.reserved, 7); assert.ok(raced.reserved <= raced.onHand); assert.ok(raced.available >= 0);
    await prisma.inventoryReservation.updateMany({ where: { productId, releasedAt: null }, data: { releasedAt: new Date() } });

    const expiry = await api(owner, 'POST', '/api/inventory-reservations', reservation(productId, warehouseAId, 3, `${marker}_EXPIRE`, { expiresAt: new Date(Date.now() + 60_000).toISOString() }));
    await prisma.inventoryReservation.update({ where: { id: expiry.body.data.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    const foreignWarehouse = await prisma.warehouse.findFirstOrThrow({ where: { tenantId: foreign.tenantId } });
    const foreignProduct = await prisma.product.findFirstOrThrow({ where: { tenantId: foreign.tenantId, deletedAt: null } });
    const foreignContact = await prisma.contact.findFirstOrThrow({ where: { tenantId: foreign.tenantId, deletedAt: null } });
    const foreignOrder = await prisma.salesOrder.create({ data: { tenantId: foreign.tenantId, contactId: foreignContact.id, number: `${marker}_FOREIGN_SO`, date: new Date(), status: 'CONFIRMED' } }); foreignOrderId = foreignOrder.id;
    assert.equal((await api(owner, 'POST', '/api/inventory-reservations', { productId, warehouseId: warehouseAId, quantity: 1, refType: 'SALES_ORDER', refId: foreignOrderId, allowPartial: false })).status, 404);
    const foreignExpired = await prisma.inventoryReservation.create({ data: { tenantId: foreign.tenantId, productId: foreignProduct.id, warehouseId: foreignWarehouse.id, quantity: 1, refType: 'OTHER', refId: marker, expiresAt: new Date(Date.now() - 60_000) } });
    const cleanup = await api(owner, 'POST', '/api/inventory-reservations/release-expired'); assert.equal(cleanup.status, 200); assert.equal(cleanup.body.data.releasedCount, 1);
    assert.ok((await prisma.inventoryReservation.findUniqueOrThrow({ where: { id: expiry.body.data.id } })).releasedAt);
    assert.equal((await prisma.inventoryReservation.findUniqueOrThrow({ where: { id: foreignExpired.id } })).releasedAt, null);
    assert.equal((await api(owner, 'POST', '/api/inventory-reservations/release-expired')).body.data.releasedCount, 0);
    assert.deepEqual(await getStockPosition(prisma, owner.tenantId, productId, warehouseAId), { onHand: 10, reserved: 0, available: 10 });

    const onlyA = await api(owner, 'POST', '/api/inventory-reservations', reservation(productId, warehouseAId, 4, `${marker}_MULTI`)); assert.equal(onlyA.status, 201);
    assert.deepEqual(await getStockPosition(prisma, owner.tenantId, productId, warehouseBId), { onHand: 20, reserved: 0, available: 20 });
    await api(owner, 'POST', `/api/inventory-reservations/${onlyA.body.data.id}/release`);
    assert.ok([403, 404].includes((await api(foreign, 'POST', '/api/inventory-reservations', reservation(productId, warehouseAId, 1, `${marker}_FOREIGN`))).status));
    assert.ok([403, 404].includes((await api(foreign, 'POST', `/api/inventory-reservations/${basic.body.data.id}/release`)).status));

    const contact = await prisma.contact.findFirstOrThrow({ where: { tenantId: owner.tenantId, deletedAt: null } });
    const cancelOrder = await prisma.salesOrder.create({ data: { tenantId: owner.tenantId, contactId: contact.id, number: `${marker}_CANCEL_SO`, date: new Date(), status: 'CONFIRMED', items: { create: { tenantId: owner.tenantId, productId, quantity: 3, unitPrice: 1, lineTotal: 3 } } } }); cancelOrderId = cancelOrder.id;
    const fromOrder = await api(owner, 'POST', '/api/inventory-reservations/from-sales-order', { orderId: cancelOrderId, warehouseId: warehouseAId, allowPartial: false, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
    assert.equal(fromOrder.status, 201); assert.equal(fromOrder.body.data.createdCount, 1); assert.equal(Number(fromOrder.body.data.totalReservedQuantity), 3);
    assert.equal(await prisma.inventoryReservation.count({ where: { tenantId: owner.tenantId, refType: 'SALES_ORDER', refId: cancelOrderId, releasedAt: null } }), 1);
    assert.equal((await api(owner, 'POST', `/api/sales-orders/${cancelOrderId}/cancel`)).status, 200);
    assert.equal(await prisma.inventoryReservation.count({ where: { tenantId: owner.tenantId, refType: 'SALES_ORDER', refId: cancelOrderId, releasedAt: null } }), 0);
    const order = await prisma.salesOrder.create({ data: { tenantId: owner.tenantId, contactId: contact.id, number: `${marker}_SO`, date: new Date(), status: 'CONFIRMED', items: { create: { tenantId: owner.tenantId, productId, quantity: 10, unitPrice: 1, lineTotal: 10 } } }, include: { items: true } }); orderId = order.id;
    await prisma.stockLevel.updateMany({ where: { productId, warehouseId: warehouseAId }, data: { quantity: 20 } });
    const salesReservation = await api(owner, 'POST', '/api/inventory-reservations', { productId, warehouseId: warehouseAId, quantity: 10, refType: 'SALES_ORDER', refId: orderId, allowPartial: false }); assert.equal(salesReservation.status, 201);
    const note = await prisma.deliveryNote.create({ data: { tenantId: owner.tenantId, number: `${marker}_DN1`, type: 'OUTBOUND', status: 'CONFIRMED', salesOrderId: orderId, contactId: contact.id, warehouseId: warehouseAId, date: new Date(), items: { create: { tenantId: owner.tenantId, productId, orderedQty: 10, deliveredQty: 4, salesOrderItemId: order.items[0].id } } } }); noteIds.push(note.id);
    await prisma.$transaction(tx => processDeliveryNoteStock(tx, owner.tenantId, note.id));
    assert.deepEqual(await getStockPosition(prisma, owner.tenantId, productId, warehouseAId), { onHand: 16, reserved: 6, available: 10 });
    await prisma.$transaction(tx => processDeliveryNoteStock(tx, owner.tenantId, note.id));
    assert.equal(await prisma.stockMovement.count({ where: { refType: 'DELIVERY_NOTE', refId: note.id } }), 1);
    assert.deepEqual(await getStockPosition(prisma, owner.tenantId, productId, warehouseAId), { onHand: 16, reserved: 6, available: 10 });
    console.log('PASS stock reservation core assurance (36 checks)');
  } finally {
    await prisma.inventoryReservation.deleteMany({ where: { OR: [{ productId }, { refId: marker }] } });
    const movements = await prisma.stockMovement.findMany({ where: { productId }, select: { id: true } });
    await prisma.stockValuation.deleteMany({ where: { movementId: { in: movements.map(x => x.id) } } });
    await prisma.stockMovement.deleteMany({ where: { productId } });
    if (noteIds.length) { await prisma.deliveryNoteItem.deleteMany({ where: { deliveryNoteId: { in: noteIds } } }); await prisma.deliveryNote.deleteMany({ where: { id: { in: noteIds } } }); }
    for (const id of [orderId, cancelOrderId].filter(Boolean)) { await prisma.salesOrderItem.deleteMany({ where: { orderId: id } }); await prisma.salesOrderHistory.deleteMany({ where: { orderId: id } }); await prisma.salesOrder.deleteMany({ where: { id } }); }
    if (foreignOrderId) { await prisma.salesOrderItem.deleteMany({ where: { orderId: foreignOrderId } }); await prisma.salesOrderHistory.deleteMany({ where: { orderId: foreignOrderId } }); await prisma.salesOrder.deleteMany({ where: { id: foreignOrderId } }); }
    if (productId) { await prisma.stockLevel.deleteMany({ where: { productId } }); await prisma.product.deleteMany({ where: { id: productId } }); }
    await prisma.location.deleteMany({ where: { warehouseId: { in: [warehouseAId, warehouseBId].filter(Boolean) } } });
    await prisma.warehouse.deleteMany({ where: { id: { in: [warehouseAId, warehouseBId].filter(Boolean) } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
