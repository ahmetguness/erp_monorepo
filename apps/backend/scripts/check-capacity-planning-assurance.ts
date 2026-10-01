import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { getCapacityPlanning } from '../src/modules/production/infrastructure/services/capacity-planning.service.js';

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_CAPACITY_${Date.now()}`;
type Session = { cookie: string; tenantId: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug }) });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  return { cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', tenantId: body.data.tenant.id };
}

async function api(session: Session | null, query = '') {
  const response = await fetch(`${baseUrl}/api/production/capacity-planning${query}`, { headers: { origin, ...(session ? { cookie: session.cookie } : {}) } });
  return { status: response.status, body: await response.json().catch(() => null) as any };
}

async function main() {
  const owner = await login('admin@axondemo.com', 'axon-demo');
  const unauthorized = await login('muhasebe@axondemo.com', 'axon-demo');
  const foreign = await login('pro@axondemo.com', 'axon-pro-demo');
  const workCenterIds: string[] = []; const workOrderIds: string[] = []; const productIds: string[] = [];
  try {
    assert.equal((await api(null)).status, 401);
    assert.equal((await api(unauthorized)).status, 403);
    for (const value of ['abc', '7abc', '7.5', '0', '6', '91', '999999999999999999999']) assert.equal((await api(owner, `?horizonDays=${value}`)).status, 400, value);
    assert.equal((await api(owner, '?horizonDays=7')).status, 200);

    const category = await prisma.category.findFirstOrThrow({ where: { tenantId: owner.tenantId } });
    const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: owner.tenantId } });
    const product = await prisma.product.create({ data: { tenantId: owner.tenantId, categoryId: category.id, unitId: unit.id, code: `${marker}_P`, name: `${marker} Product` } }); productIds.push(product.id);
    const wc = await prisma.workCenter.create({ data: { tenantId: owner.tenantId, code: `${marker}_WC`, name: `${marker} Center`, capacity: 8 } }); workCenterIds.push(wc.id);
    const zero = await prisma.workCenter.create({ data: { tenantId: owner.tenantId, code: `${marker}_ZERO`, name: `${marker} Zero Center`, capacity: 8 } }); workCenterIds.push(zero.id);
    const start = new Date(); start.setUTCHours(0, 0, 0, 0);
    await prisma.workCenterCapacity.create({ data: { tenantId: owner.tenantId, workCenterId: wc.id, date: start, capacity: 6, allocated: 7 } });
    await prisma.workCenterCapacity.createMany({ data: Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setUTCDate(date.getUTCDate() + index); return { tenantId: owner.tenantId, workCenterId: zero.id, date, capacity: 0, allocated: index === 0 ? 1 : 0 }; }) });
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
    const wo = await prisma.workOrder.create({ data: { tenantId: owner.tenantId, productId: product.id, number: `${marker}_WO`, status: 'PLANNED', plannedQty: 10, startDate: start, endDate: end } }); workOrderIds.push(wo.id);
    await prisma.workOrderOperation.createMany({ data: [
      { tenantId: owner.tenantId, workOrderId: wo.id, workCenterId: wc.id, name: `${marker} Main`, stepOrder: 1, status: 'PLANNED', plannedStartAt: start, plannedSetupTime: 60, plannedRunTime: 30 },
      { tenantId: owner.tenantId, workOrderId: wo.id, workCenterId: zero.id, name: `${marker} Zero`, stepOrder: 2, status: 'PLANNED', plannedStartAt: start, plannedSetupTime: 0, plannedRunTime: 12 },
    ] });
    await prisma.task.create({ data: { tenantId: owner.tenantId, title: marker, status: 'TODO', module: 'production', entityId: wc.id, source: `maintenance:${wc.id}:${marker}` } });

    const result = await getCapacityPlanning(prisma, { tenantId: owner.tenantId, horizonDays: 7 });
    const day = result.calendar.find((row) => row.workCenter.id === wc.id && row.date === start.toISOString().slice(0, 10))!;
    assert.equal(day.capacityHours, 6); assert.equal(day.allocatedHours, 7); assert.equal(day.availableHours, 0); assert.equal(day.utilizationPct, 116.7); assert.equal(day.blockages.downtimeHours, 2); assert.equal(day.blockages.maintenanceTaskCount, 1);
    const mainSequence = result.sequence.find((row) => row.workCenter.id === wc.id)!;
    assert.equal(mainSequence.estimatedHours, 6); assert.equal(mainSequence.queueRank, 1);
    const mainBottle = result.bottlenecks.find((row) => row.workCenter.id === wc.id)!;
    assert.equal(mainBottle.capacityHours, 54); assert.equal(mainBottle.allocatedHours, 7); assert.equal(mainBottle.queuedHours, 6); assert.equal(mainBottle.totalLoadHours, 13); assert.equal(mainBottle.availableHours, 41);
    const zeroBottle = result.bottlenecks.find((row) => row.workCenter.id === zero.id)!;
    assert.equal(zeroBottle.capacityHours, 0); assert.equal(zeroBottle.totalLoadHours, 3); assert.equal(zeroBottle.utilizationPct, 100); assert.equal(zeroBottle.severity, 'critical'); assert.equal(zeroBottle.availableHours, 0);
    assert.equal(result.summary.calendarDays, 7); assert.equal(result.summary.queuedOperationCount >= 2, true); assert.equal(result.summary.maintenanceBlockCount >= 1, true);

    const foreignResult = await getCapacityPlanning(prisma, { tenantId: foreign.tenantId, horizonDays: 7 });
    assert.equal(foreignResult.bottlenecks.some((row) => workCenterIds.includes(row.workCenter.id)), false);
    assert.equal(foreignResult.sequence.some((row) => workOrderIds.includes(row.workOrderId)), false);
    console.log('PASS capacity planning assurance: auth, strict validation, calendar, shifts, downtime, maintenance, overload, zero-capacity bottleneck, sequencing, calculations and tenant isolation');
  } finally {
    await prisma.task.deleteMany({ where: { tenantId: owner.tenantId, title: marker } });
    await prisma.workOrder.deleteMany({ where: { id: { in: workOrderIds } } });
    await prisma.workCenter.deleteMany({ where: { id: { in: workCenterIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
