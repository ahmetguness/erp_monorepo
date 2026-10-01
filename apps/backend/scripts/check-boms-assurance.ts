import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_BOM_${Date.now()}`;
type Session = { cookie: string; tenantId: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug }) });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  return { cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', tenantId: body.data.tenant.id };
}

async function request(session: Session | null, path = '', method = 'GET', body?: unknown) {
  const response = await fetch(`${baseUrl}/api/production/boms${path}`, { method, headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json().catch(() => null) as any };
}

async function main() {
  const owner = await login('admin@axondemo.com', 'axon-demo');
  const unauthorized = await login('muhasebe@axondemo.com', 'axon-demo');
  const foreign = await login('pro@axondemo.com', 'axon-pro-demo');
  const productIds: string[] = [];
  const bomIds: string[] = [];
  const workCenterIds: string[] = [];
  let workOrderId = '';
  try {
    assert.equal((await request(null)).status, 401);
    assert.equal((await request(unauthorized)).status, 403);
    assert.equal((await request(owner, '?status=invalid')).status, 400);
    for (const payload of [{}, { productId: 'x', name: '   ' }, { productId: 'x', name: 'x', effectiveFrom: 'invalid' }, { productId: 'x', name: 'x', effectiveFrom: '2026-02-02', effectiveTo: '2026-02-01' }]) assert.equal((await request(owner, '', 'POST', payload)).status, 400);

    const category = await prisma.category.findFirstOrThrow({ where: { tenantId: owner.tenantId } });
    const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: owner.tenantId } });
    const makeProduct = async (suffix: string, averageCost = 0) => { const row = await prisma.product.create({ data: { tenantId: owner.tenantId, categoryId: category.id, unitId: unit.id, code: `${marker}_${suffix}`, name: `${marker} ${suffix}`, averageCost } }); productIds.push(row.id); return row; };
    const fg = await makeProduct('FG'); const raw = await makeProduct('RAW', 10); const extra = await makeProduct('EXTRA', 5); const secondFg = await makeProduct('FG2'); const cycleProduct = await makeProduct('CYCLE');
    const wc = await prisma.workCenter.create({ data: { tenantId: owner.tenantId, code: `${marker}_WC`, name: `${marker} Merkezi`, capacity: 8, laborRate: 60, overheadRate: 30 } }); workCenterIds.push(wc.id);
    const foreignProduct = await prisma.product.findFirstOrThrow({ where: { tenantId: foreign.tenantId, deletedAt: null } });
    const foreignWorkCenter = await prisma.workCenter.create({ data: { tenantId: foreign.tenantId, code: `${marker}_FOREIGN_WC`, name: `${marker} Foreign Merkezi`, capacity: 8 } }); workCenterIds.push(foreignWorkCenter.id);
    assert.equal((await request(owner, '', 'POST', { productId: foreignProduct.id, name: marker })).status, 404);
    assert.equal((await request(owner, '', 'POST', { productId: fg.id, name: marker, items: [{ productId: foreignProduct.id, quantity: 1 }] })).status, 404);
    assert.equal((await request(owner, '', 'POST', { productId: fg.id, name: marker, items: [{ productId: raw.id, quantity: 0 }] })).status, 400);
    assert.equal((await request(owner, '', 'POST', { productId: fg.id, name: marker, items: [{ productId: raw.id, quantity: -1 }] })).status, 400);
    assert.equal((await request(owner, '', 'POST', { productId: fg.id, name: marker, items: [{ productId: fg.id, quantity: 1 }] })).status, 400);
    assert.equal((await request(owner, '', 'POST', { productId: fg.id, name: marker, items: [{ productId: raw.id, quantity: 1 }, { productId: raw.id, quantity: 2 }] })).status, 409);

    const created = await request(owner, '', 'POST', { productId: fg.id, name: `${marker} Türkçe Reçete`, version: '1.0', effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: '2027-01-01T00:00:00.000Z', items: [{ productId: raw.id, quantity: 2.5, unit: 'KG', notes: 'Türkçe kalem' }] });
    assert.equal(created.status, 201); const bomId = created.body.data.id as string; bomIds.push(bomId);
    const dbBom = await prisma.bOM.findUniqueOrThrow({ where: { id: bomId }, include: { items: true } });
    assert.equal(dbBom.tenantId, owner.tenantId); assert.equal(dbBom.name, `${marker} Türkçe Reçete`); assert.equal(dbBom.items.length, 1); assert.equal(Number(dbBom.items[0]!.quantity), 2.5); assert.equal(dbBom.items[0]!.sortOrder, 0);
    assert.equal((await request(owner, '', 'POST', { productId: fg.id, name: `${marker} duplicate`, version: '1.0' })).status, 409);
    const searched = await request(owner, `?search=${encodeURIComponent(`${marker} Türkçe`)}&status=active&page=1&limit=1`); assert.equal(searched.status, 200); assert.equal(searched.body.meta.total, 1); assert.equal(searched.body.data[0].id, bomId);
    assert.equal((await request(foreign, `/${bomId}`)).status, 404); assert.equal((await request(foreign, `/${bomId}/engineering`)).status, 404); assert.equal([403, 404].includes((await request(foreign, `/${bomId}`, 'PATCH', { name: 'hack' })).status), true);
    const detail = await request(owner, `/${bomId}`); assert.equal(detail.status, 200); assert.equal(detail.body.data.items.length, 1);
    const engineeringBefore = await request(owner, `/${bomId}/engineering`); assert.equal(engineeringBefore.status, 200); assert.equal(engineeringBefore.body.data.summary.revisionCount, 1); assert.equal(engineeringBefore.body.data.alternativeMaterials[0].requiredQty, 2.5);
    assert.equal((await request(owner, `/${bomId}`, 'PATCH', { name: '   ' })).status, 400); assert.equal((await request(owner, `/${bomId}`, 'PATCH', { effectiveFrom: '2027-02-01', effectiveTo: '2027-01-01' })).status, 400);
    const updated = await request(owner, `/${bomId}`, 'PATCH', { name: `${marker} Güncel`, version: '1.1', isActive: false }); assert.equal(updated.status, 200); assert.equal(updated.body.data.name, `${marker} Güncel`); assert.equal(updated.body.data.isActive, false);
    const passive = await request(owner, `?search=${encodeURIComponent(marker)}&status=passive`); assert.equal(passive.status, 200); assert.equal(passive.body.data.some((row: any) => row.id === bomId), true);

    assert.equal((await request(owner, `/${bomId}/items`, 'POST', { productId: foreignProduct.id, quantity: 1 })).status, 404);
    assert.equal((await request(owner, `/${bomId}/items`, 'POST', { productId: extra.id, quantity: '1' })).status, 400);
    const concurrentItems = await Promise.all([request(owner, `/${bomId}/items`, 'POST', { productId: extra.id, quantity: 3 }), request(owner, `/${bomId}/items`, 'POST', { productId: extra.id, quantity: 3 })]);
    assert.equal(concurrentItems.filter((row) => row.status === 201).length, 1); assert.equal(concurrentItems.filter((row) => row.status === 409).length, 1); assert.equal(await prisma.bOMItem.count({ where: { bomId, productId: extra.id } }), 1);
    assert.equal((await request(owner, `/${bomId}/items`, 'POST', { productId: fg.id, quantity: 1 })).status, 400);

    assert.equal((await request(owner, `/${bomId}/routings`, 'POST', { workCenterId: wc.id, name: 'x', stepOrder: 0 })).status, 400);
    assert.equal((await request(owner, `/${bomId}/routings`, 'POST', { workCenterId: wc.id, name: 'x', stepOrder: 1, runTime: -1 })).status, 400);
    assert.equal((await request(owner, `/${bomId}/routings`, 'POST', { workCenterId: foreignWorkCenter.id, name: 'x', stepOrder: 1 })).status, 404);
    const routing = await request(owner, `/${bomId}/routings`, 'POST', { workCenterId: wc.id, name: `${marker} Kesim`, stepOrder: 1, setupTime: 60, runTime: 30 }); assert.equal(routing.status, 201); const routingId = routing.body.data.id as string;
    assert.equal((await request(owner, `/${bomId}/routings`, 'POST', { workCenterId: wc.id, name: 'duplicate', stepOrder: 1 })).status, 409);
    const engineering = await request(owner, `/${bomId}/engineering`); assert.equal(engineering.status, 200); assert.equal(engineering.body.data.summary.routeStepCount, 1); assert.equal(engineering.body.data.operationRoutes[0].plannedCostPerUnit, 135);

    const second = await request(owner, '', 'POST', { productId: secondFg.id, name: `${marker} İkinci`, version: '1.0', items: [{ productId: cycleProduct.id, quantity: 1 }] }); assert.equal(second.status, 201); const secondBomId = second.body.data.id as string; bomIds.push(secondBomId);
    const secondRouting = await request(owner, `/${secondBomId}/routings`, 'POST', { workCenterId: wc.id, name: 'İkinci rota', stepOrder: 1 }); assert.equal(secondRouting.status, 201);
    const secondDetail = await request(owner, `/${secondBomId}`); const secondItemId = secondDetail.body.data.items[0].id as string; const secondRoutingId = secondDetail.body.data.routings[0].id as string;
    assert.equal((await request(owner, `/${bomId}/items/${secondItemId}`, 'DELETE')).status, 404); assert.equal(await prisma.bOMItem.count({ where: { id: secondItemId } }), 1);
    assert.equal((await request(owner, `/${bomId}/routings/${secondRoutingId}`, 'DELETE')).status, 404); assert.equal(await prisma.routingOperation.count({ where: { id: secondRoutingId } }), 1);
    const cycleBom = await request(owner, '', 'POST', { productId: cycleProduct.id, name: `${marker} Döngü`, version: '1.0' }); assert.equal(cycleBom.status, 201); bomIds.push(cycleBom.body.data.id);
    assert.equal((await request(owner, `/${cycleBom.body.data.id}/items`, 'POST', { productId: secondFg.id, quantity: 1 })).status, 409);

    await request(owner, `/${bomId}`, 'PATCH', { isActive: true });
    const workOrderResponse = await fetch(`${baseUrl}/api/production/work-orders`, { method: 'POST', headers: { origin, cookie: owner.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ productId: fg.id, bomId, plannedQty: 4 }) });
    assert.equal(workOrderResponse.status, 201); workOrderId = ((await workOrderResponse.json()) as any).data.id;
    const workOrder = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, include: { items: true, operations: true } }); assert.equal(workOrder.items.length, 2); assert.equal(Number(workOrder.items.find((row) => row.productId === raw.id)!.requiredQty), 10); assert.equal(Number(workOrder.items.find((row) => row.productId === extra.id)!.requiredQty), 12); assert.equal(workOrder.operations.length, 1); assert.equal(workOrder.operations[0]!.name, `${marker} Kesim`);
    assert.equal((await request(owner, `/${bomId}/items/${detail.body.data.items[0].id}`, 'DELETE')).status, 200); assert.equal((await request(owner, `/${bomId}/routings/${routingId}`, 'DELETE')).status, 200);
    const snapshot = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, include: { items: true, operations: true } }); assert.equal(snapshot.items.length, 2); assert.equal(snapshot.operations.length, 1);
    console.log('PASS BOM assurance: auth, tenant ownership, validation, CRUD, search/filter/pagination, concurrent uniqueness, cycle prevention, engineering, scoped deletes and work-order snapshot');
  } finally {
    if (workOrderId) { await prisma.workOrder.deleteMany({ where: { id: workOrderId } }); }
    await prisma.bOM.deleteMany({ where: { id: { in: bomIds } } });
    await prisma.workCenter.deleteMany({ where: { id: { in: workCenterIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    assert.equal(await prisma.bOM.count({ where: { id: { in: bomIds } } }), 0);
    assert.equal(await prisma.workCenter.count({ where: { id: { in: workCenterIds } } }), 0);
    assert.equal(await prisma.product.count({ where: { id: { in: productIds } } }), 0);
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
