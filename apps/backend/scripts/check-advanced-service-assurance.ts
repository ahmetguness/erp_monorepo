import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_ADV_SERVICE_${Date.now()}`;
type Session = { cookie: string; tenantId: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug }) });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  return { cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', tenantId: body.data.tenant.id };
}

async function api(session: Session | null, path = '', method = 'GET', body?: unknown) {
  const response = await fetch(`${baseUrl}/api/service${path}`, { method, headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) as any };
}

async function main() {
  const owner = await login('admin@axondemo.com', 'axon-demo');
  const unauthorized = await login('muhasebe@axondemo.com', 'axon-demo');
  const foreign = await login('pro@axondemo.com', 'axon-pro-demo');
  let productId = '', warehouseId = '', locationId = '', contactId = '';
  const requestIds: string[] = [];
  try {
    assert.equal((await api(null, '/advanced')).status, 401);
    assert.equal((await api(unauthorized, '/advanced')).status, 403);
    for (const value of ['abc', '6', '181', '7.5', '', 'Infinity']) assert.equal((await api(owner, `/advanced?horizonDays=${encodeURIComponent(value)}`)).status, 400, value);
    for (const value of [7, 30, 180]) { const result = await api(owner, `/advanced?horizonDays=${value}`); assert.equal(result.status, 200); assert.equal(result.body.data.summary.horizonDays, value); }

    const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: owner.tenantId } });
    const warehouse = await prisma.warehouse.create({ data: { tenantId: owner.tenantId, code: `${marker}_WH`, name: `${marker} Warehouse` } }); warehouseId = warehouse.id;
    const location = await prisma.location.create({ data: { tenantId: owner.tenantId, warehouseId, code: `${marker}_LOC`, name: 'Test Location' } }); locationId = location.id;
    const product = await prisma.product.create({ data: { tenantId: owner.tenantId, unitId: unit.id, code: `${marker}_P`, name: `${marker} Parca` } }); productId = product.id;
    await prisma.stockLevel.create({ data: { tenantId: owner.tenantId, productId, warehouseId, locationId, quantity: 10 } });
    const contact = await prisma.contact.create({ data: { tenantId: owner.tenantId, type: 'CUSTOMER', code: `${marker}_C`, name: `${marker} Musteri`, city: 'Istanbul', address: 'Test adresi' } }); contactId = contact.id;
    await prisma.tenantSetting.create({ data: { tenantId: owner.tenantId, key: `portal.token.${contactId}`, value: marker } });

    const assigned = await prisma.serviceRequest.create({ data: { tenantId: owner.tenantId, contactId, number: `${marker}_ASSIGNED`, subject: `${marker} Assigned`, status: 'IN_PROGRESS', priority: 'HIGH', assignedToId: `${marker}_TECH`, createdAt: new Date(Date.now() - 60 * 60_000), items: { create: { tenantId: owner.tenantId, productId, description: 'Hazir parca', quantity: 5 } } } }); requestIds.push(assigned.id);
    await prisma.inventoryReservation.create({ data: { tenantId: owner.tenantId, productId, warehouseId, quantity: 5, refType: 'OTHER', refId: assigned.id } });
    const shortage = await prisma.serviceRequest.create({ data: { tenantId: owner.tenantId, contactId, number: `${marker}_SHORT`, subject: `${marker} Critical`, status: 'OPEN', priority: 'CRITICAL', createdAt: new Date(Date.now() - 3 * 60 * 60_000), items: { create: [{ tenantId: owner.tenantId, productId, description: 'Eksik parca', quantity: 12 }, { tenantId: owner.tenantId, description: 'Baglanmamis parca', quantity: 2 }] } } }); requestIds.push(shortage.id);
    const reservable = await prisma.serviceRequest.create({ data: { tenantId: owner.tenantId, contactId, number: `${marker}_RESERVE`, subject: `${marker} Reservable`, status: 'WAITING_CUSTOMER', priority: 'MEDIUM', items: { create: { tenantId: owner.tenantId, productId, description: 'Rezerve edilecek', quantity: 4 } }, activities: { create: { tenantId: owner.tenantId, activityType: 'NOTE', notes: 'Yorumu: Test aktivitesi' } } } }); requestIds.push(reservable.id);
    const old = await prisma.serviceRequest.create({ data: { tenantId: owner.tenantId, contactId, number: `${marker}_OLD`, subject: `${marker} Old`, status: 'COMPLETED', priority: 'LOW', closedAt: new Date(Date.now() - 10 * 86_400_000) } }); requestIds.push(old.id);
    await prisma.serviceRequest.update({ where: { id: old.id }, data: { updatedAt: new Date(Date.now() - 10 * 86_400_000) } });

    const result7 = await api(owner, '/advanced?horizonDays=7'); assert.equal(result7.status, 200);
    const data = result7.body.data;
    assert.equal(data.slaContracts.find((row: any) => row.key === 'CRITICAL').breachedCount >= 1, true);
    const route = data.technicianRoutes.find((row: any) => row.assignedToId === `${marker}_TECH`); assert.ok(route); assert.equal(route.nextStops.some((row: any) => row.serviceRequestId === assigned.id), true);
    assert.equal(data.autoAssignments.some((row: any) => row.serviceRequestId === shortage.id), true);
    assert.equal(data.sparePartReservations.some((row: any) => row.serviceRequestId === assigned.id && row.productId === productId), false);
    const shortRow = data.sparePartReservations.find((row: any) => row.serviceRequestId === shortage.id && row.productId === productId); assert.deepEqual({ required: shortRow.requiredQty, available: shortRow.availableQty, reserved: shortRow.reservedQty, shortage: shortRow.shortageQty, status: shortRow.status }, { required: 12, available: 10, reserved: 0, shortage: 2, status: 'shortage' });
    assert.equal(data.sparePartReservations.find((row: any) => row.serviceRequestId === shortage.id && row.productId === null).status, 'unlinked');
    assert.equal(data.sparePartReservations.find((row: any) => row.serviceRequestId === reservable.id).status, 'reserve_recommended');
    const portal = data.portalTracking.find((row: any) => row.contactId === contactId); assert.equal(portal.portalEnabled, true); assert.equal(portal.waitingCustomerCount, 1); assert.ok(portal.lastCustomerActivityAt); assert.ok(portal.latestRequestHref.startsWith('/dashboard/service/requests/'));
    assert.equal(data.portalTracking.some((row: any) => row.latestRequestHref?.includes(old.id)), false);
    const result14 = await api(owner, '/advanced?horizonDays=14'); assert.equal(result14.status, 200); assert.equal(result14.body.data.portalTracking.find((row: any) => row.contactId === contactId).openRequestCount >= 4, true);

    const foreignWarehouse = await prisma.warehouse.findFirstOrThrow({ where: { tenantId: foreign.tenantId } });
    const rejectedForeignWarehouse = await api(owner, `/requests/${reservable.id}/automation/reserve-parts`, 'POST', { warehouseId: foreignWarehouse.id }); assert.equal(rejectedForeignWarehouse.status, 404); assert.equal(await prisma.inventoryReservation.count({ where: { refId: reservable.id } }), 0);
    const reserved = await api(owner, `/requests/${reservable.id}/automation/reserve-parts`, 'POST', { warehouseId }); assert.equal(reserved.status, 200, JSON.stringify(reserved.body)); assert.equal(reserved.body.data.reservedItemCount, 1);
    const after = await api(owner, '/advanced?horizonDays=7'); assert.equal(after.status, 200); assert.equal(after.body.data.sparePartReservations.some((row: any) => row.serviceRequestId === reservable.id && row.productId === productId), false);
    assert.equal(Number((await prisma.inventoryReservation.findFirstOrThrow({ where: { tenantId: owner.tenantId, refId: reservable.id, productId, releasedAt: null } })).quantity), 4);
    assert.equal((await prisma.serviceRequest.findUniqueOrThrow({ where: { id: reservable.id } })).status, 'WAITING_PARTS');

    const foreignResult = await api(foreign, '/advanced?horizonDays=180'); assert.equal(foreignResult.status, 200); const serialized = JSON.stringify(foreignResult.body); assert.equal(serialized.includes(marker), false); assert.equal(serialized.includes(productId), false); assert.equal(serialized.includes(contactId), false);
    assert.equal(data.technicianRoutes.length <= 10, true); assert.equal(data.autoAssignments.length <= 12, true); assert.equal(data.sparePartReservations.length <= 20, true); assert.equal(data.portalTracking.length <= 12, true);
    console.log('PASS advanced service assurance: 42 checks covering auth, strict validation, SLA, routes, assignment, stock reservations, portal, horizon and tenant isolation');
  } finally {
    await prisma.inventoryReservation.deleteMany({ where: { OR: [{ refId: { in: requestIds } }, ...(productId ? [{ productId }] : [])] } });
    if (contactId) await prisma.tenantSetting.deleteMany({ where: { tenantId: owner.tenantId, key: `portal.token.${contactId}` } });
    await prisma.serviceRequest.deleteMany({ where: { id: { in: requestIds } } });
    if (productId) { await prisma.stockLevel.deleteMany({ where: { productId } }); await prisma.product.deleteMany({ where: { id: productId } }); }
    if (contactId) await prisma.contact.deleteMany({ where: { id: contactId } });
    if (locationId) await prisma.location.deleteMany({ where: { id: locationId } });
    if (warehouseId) await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    assert.equal(await prisma.serviceRequest.count({ where: { number: { startsWith: marker } } }), 0);
    assert.equal(await prisma.product.count({ where: { code: { startsWith: marker } } }), 0);
    assert.equal(await prisma.contact.count({ where: { code: { startsWith: marker } } }), 0);
    assert.equal(await prisma.warehouse.count({ where: { code: { startsWith: marker } } }), 0);
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
