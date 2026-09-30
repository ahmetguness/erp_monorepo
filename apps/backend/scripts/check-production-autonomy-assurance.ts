import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_PROD_AUTO_${Date.now()}`;
type Session = { cookie: string; tenantId: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug }) });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  return { cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', tenantId: body.data.tenant.id };
}

async function api(session: Session | null, method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) as any };
}

async function main() {
  const owner = await login('admin@axondemo.com', 'axon-demo');
  const unauthorized = await login('muhasebe@axondemo.com', 'axon-demo');
  const foreign = await login('pro@axondemo.com', 'axon-pro-demo');
  let productId = ''; let workCenterId = ''; let workOrderId = ''; let foreignProductId = ''; let foreignWorkCenterId = ''; let foreignCategoryId = ''; let foreignUnitId = '';
  try {
    for (const [method, path] of [['GET', '/api/production-autonomy/work-center-capacity'], ['GET', '/api/production-autonomy/predictive-maintenance'], ['POST', '/api/production-autonomy/optimize-schedule'], ['POST', '/api/production-autonomy/reserve-maintenance-parts']]) {
      assert.equal((await api(null, method, path)).status, 401);
      assert.equal((await api(unauthorized, method, path, method === 'POST' ? {} : undefined)).status, 403);
    }
    assert.equal((await api(owner, 'POST', '/api/production-autonomy/optimize-schedule', { autoReschedule: 'true' })).status, 400);
    for (const body of [{}, { workCenterId: ' ', productId: 'x', quantity: 1 }, { workCenterId: 'x', productId: 'x', quantity: 0 }, { workCenterId: 'x', productId: 'x', quantity: -1 }, { workCenterId: 'x', productId: 'x', quantity: 1.0001 }, { workCenterId: 'x', productId: 'x', quantity: 1e20 }]) {
      assert.equal((await api(owner, 'POST', '/api/production-autonomy/reserve-maintenance-parts', body)).status, 400);
    }

    const category = await prisma.category.findFirstOrThrow({ where: { tenantId: owner.tenantId } });
    const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: owner.tenantId } });
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { tenantId: owner.tenantId, isActive: true }, orderBy: { code: 'asc' } });
    const product = await prisma.product.create({ data: { tenantId: owner.tenantId, code: `000_${marker}_P`, name: `${marker}_Parça`, categoryId: category.id, unitId: unit.id, purchasePrice: 1, salesPrice: 2 } }); productId = product.id;
    const wc = await prisma.workCenter.create({ data: { tenantId: owner.tenantId, code: `000_${marker}_WC`, name: `${marker}_Merkez`, capacity: 8 } }); workCenterId = wc.id;
    const wo = await prisma.workOrder.create({ data: { tenantId: owner.tenantId, productId, number: `${marker}_WO`, plannedQty: 1, status: 'PLANNED', createdAt: new Date('2000-01-01T00:00:00Z') } }); workOrderId = wo.id;
    await prisma.workOrderOperation.create({ data: { tenantId: owner.tenantId, workOrderId, workCenterId, name: `${marker}_OP`, stepOrder: 1, plannedRunTime: 34, status: 'PLANNED' } });

    const foreignCategory = await prisma.category.create({ data: { tenantId: foreign.tenantId, name: `${marker}_CAT` } }); foreignCategoryId = foreignCategory.id;
    const foreignUnit = await prisma.unit.create({ data: { tenantId: foreign.tenantId, code: `${marker}_UNIT`, name: marker } }); foreignUnitId = foreignUnit.id;
    const fp = await prisma.product.create({ data: { tenantId: foreign.tenantId, code: `${marker}_FP`, name: marker, categoryId: foreignCategory.id, unitId: foreignUnit.id, purchasePrice: 1, salesPrice: 2 } }); foreignProductId = fp.id;
    const fwc = await prisma.workCenter.create({ data: { tenantId: foreign.tenantId, code: `${marker}_FWC`, name: marker, capacity: 8 } }); foreignWorkCenterId = fwc.id;

    const capacity = await api(owner, 'GET', '/api/production-autonomy/work-center-capacity'); assert.equal(capacity.status, 200);
    const capacityRow = capacity.body.data.find((row: any) => row.workCenterId === workCenterId);
    assert.equal(capacityRow.plannedWorkloadHours, 34); assert.equal(capacityRow.utilizationPct, 85); assert.equal(capacityRow.status, 'BOTTLENECK');

    const before = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    const dryRun = await api(owner, 'POST', '/api/production-autonomy/optimize-schedule', { autoReschedule: false }); assert.equal(dryRun.status, 200);
    assert.equal(dryRun.body.data.details.some((row: any) => row.workOrderId === workOrderId), true);
    assert.equal((await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId } })).startDate?.toISOString(), before.startDate?.toISOString());
    const scheduled = await api(owner, 'POST', '/api/production-autonomy/optimize-schedule', { autoReschedule: true }); assert.equal(scheduled.status, 200);
    const scheduledDb = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId } }); assert.ok(scheduledDb.startDate); assert.equal(scheduledDb.endDate!.getTime() - scheduledDb.startDate!.getTime(), 8 * 3600_000);

    assert.equal((await api(owner, 'POST', '/api/production-autonomy/reserve-maintenance-parts', { workCenterId: foreignWorkCenterId, productId, quantity: 2 })).status, 404);
    assert.equal((await api(owner, 'POST', '/api/production-autonomy/reserve-maintenance-parts', { workCenterId, productId: foreignProductId, quantity: 2 })).status, 404);
    assert.equal((await api(owner, 'POST', '/api/production-autonomy/reserve-maintenance-parts', { workCenterId, productId, quantity: 2 })).status, 400);
    const location = await prisma.location.findFirst({ where: { tenantId: owner.tenantId, warehouseId: warehouse.id, isActive: true } })
      ?? await prisma.location.create({ data: { tenantId: owner.tenantId, warehouseId: warehouse.id, code: `${marker}_LOC`, name: marker, isActive: true } });
    await prisma.stockLevel.create({ data: { tenantId: owner.tenantId, productId, warehouseId: warehouse.id, locationId: location.id, quantity: 10 } });

    const concurrent = await Promise.all([
      api(owner, 'POST', '/api/production-autonomy/reserve-maintenance-parts', { workCenterId, productId, quantity: 2 }),
      api(owner, 'POST', '/api/production-autonomy/reserve-maintenance-parts', { workCenterId, productId, quantity: 2 }),
    ]);
    assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 200]);
    assert.equal(concurrent[0].body.data.reservationId, concurrent[1].body.data.reservationId);
    const reservations = await prisma.inventoryReservation.findMany({ where: { tenantId: owner.tenantId, productId, refId: workCenterId, releasedAt: null } });
    assert.equal(reservations.length, 1); assert.equal(Number(reservations[0].quantity), 2); assert.equal(reservations[0].warehouseId, warehouse.id);
    assert.equal((await api(owner, 'POST', '/api/production-autonomy/reserve-maintenance-parts', { workCenterId, productId, quantity: 3 })).status, 409);
    assert.equal(await prisma.auditLog.count({ where: { tenantId: owner.tenantId, entityId: workCenterId, action: 'CREATE' } }), 1);

    const maintenance = await api(owner, 'GET', '/api/production-autonomy/predictive-maintenance'); assert.equal(maintenance.status, 200);
    const recommendation = maintenance.body.data.find((row: any) => row.workCenterId === workCenterId)?.recommendedSpareParts.find((row: any) => row.productId === productId);
    assert.equal(recommendation?.isReserved, true);
    const foreignCapacity = await api(foreign, 'GET', '/api/production-autonomy/work-center-capacity');
    assert.equal(foreignCapacity.status, 200);
    assert.equal(foreignCapacity.body.data.some((row: any) => row.workCenterId === workCenterId), false);
    assert.equal((await api(foreign, 'POST', '/api/production-autonomy/optimize-schedule', { autoReschedule: true })).status, 403);
    assert.equal(await prisma.inventoryReservation.count({ where: { tenantId: foreign.tenantId, refId: workCenterId } }), 0);
    console.log('PASS production autonomy assurance: auth, RBAC, capacity math, scheduling, tenant ownership, stock, concurrency, audit and traceability');
  } finally {
    if (workCenterId) await prisma.inventoryReservation.deleteMany({ where: { refId: workCenterId } });
    if (workOrderId) await prisma.workOrder.deleteMany({ where: { id: workOrderId } });
    if (workCenterId) await prisma.workCenter.deleteMany({ where: { id: workCenterId } });
    if (productId) { await prisma.stockLevel.deleteMany({ where: { productId } }); await prisma.product.deleteMany({ where: { id: productId } }); }
    await prisma.location.deleteMany({ where: { code: `${marker}_LOC` } });
    if (foreignWorkCenterId) await prisma.workCenter.deleteMany({ where: { id: foreignWorkCenterId } });
    if (foreignProductId) await prisma.product.deleteMany({ where: { id: foreignProductId } });
    if (foreignCategoryId) await prisma.category.deleteMany({ where: { id: foreignCategoryId } });
    if (foreignUnitId) await prisma.unit.deleteMany({ where: { id: foreignUnitId } });
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
