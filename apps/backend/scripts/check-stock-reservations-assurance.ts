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
  let productId = '', warehouseAId = '', warehouseBId = '', orderId = '';
  const noteIds: string[] = [];
  try {
    assert.equal((await api(null, 'GET', '/api/inventory-reservations')).status, 401);
    assert.equal((await api(unauthorized, 'POST', '/api/inventory-reservations', {})).status, 403);
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

    const basic = await api(warehouseUser, 'POST', '/api/inventory-reservations', reservation(productId, warehouseAId, 4, `${marker}_BASIC`));
    assert.equal(basic.status, 201, JSON.stringify(basic.body));
    assert.deepEqual(await getStockPosition(prisma, owner.tenantId, productId, warehouseAId), { onHand: 10, reserved: 4, available: 6 });
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
    if (orderId) { await prisma.salesOrderItem.deleteMany({ where: { orderId } }); await prisma.salesOrder.deleteMany({ where: { id: orderId } }); }
    if (productId) { await prisma.stockLevel.deleteMany({ where: { productId } }); await prisma.product.deleteMany({ where: { id: productId } }); }
    await prisma.location.deleteMany({ where: { warehouseId: { in: [warehouseAId, warehouseBId].filter(Boolean) } } });
    await prisma.warehouse.deleteMany({ where: { id: { in: [warehouseAId, warehouseBId].filter(Boolean) } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
