import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient(); const baseUrl = process.env.API_URL ?? 'http://localhost:3001'; const origin = 'http://localhost:3000'; const marker = `TEST_E2E_WO_${Date.now()}`;
type Session = { cookie: string; tenantId: string };
async function login(email: string, tenantSlug: string): Promise<Session> { const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug }) }); assert.equal(response.status, 200); const body = await response.json() as any; return { cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', tenantId: body.data.tenant.id }; }
async function api(session: Session | null, path = '', method = 'GET', body?: unknown) { const response = await fetch(`${baseUrl}/api/production/work-orders${path}`, { method, headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, body: await response.json().catch(() => null) as any }; }

async function main() {
  const owner = await login('admin@axondemo.com', 'axon-demo'); const unauthorized = await login('muhasebe@axondemo.com', 'axon-demo'); const foreign = await login('pro@axondemo.com', 'axon-pro-demo');
  const productIds: string[] = []; let bomId = ''; let workCenterId = ''; let workOrderId = ''; let warehouseId = ''; let locationId = '';
  try {
    assert.equal((await api(null)).status, 401); assert.equal((await api(unauthorized)).status, 403);
    assert.equal((await api(owner, '?status=INVALID')).status, 400);
    for (const payload of [{}, { productId: 'x', plannedQty: 0 }, { productId: 'x', plannedQty: -1 }, { productId: 'x', plannedQty: 1, startDate: 'invalid' }, { productId: 'x', plannedQty: 1, startDate: '2026-10-02', endDate: '2026-10-01' }]) assert.equal((await api(owner, '', 'POST', payload)).status, 400);

    const category = await prisma.category.findFirstOrThrow({ where: { tenantId: owner.tenantId } }); const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: owner.tenantId } });
    const fg = await prisma.product.create({ data: { tenantId: owner.tenantId, categoryId: category.id, unitId: unit.id, code: `${marker}_FG`, name: `${marker} Mamul`, averageCost: 20 } }); productIds.push(fg.id);
    const raw = await prisma.product.create({ data: { tenantId: owner.tenantId, categoryId: category.id, unitId: unit.id, code: `${marker}_RAW`, name: `${marker} Hammadde`, averageCost: 4 } }); productIds.push(raw.id);
    const other = await prisma.product.create({ data: { tenantId: owner.tenantId, categoryId: category.id, unitId: unit.id, code: `${marker}_OTHER`, name: `${marker} Diğer` } }); productIds.push(other.id);
    const warehouse = await prisma.warehouse.create({ data: { tenantId: owner.tenantId, code: `${marker}_WH`, name: `${marker} Depo` } }); warehouseId = warehouse.id;
    const location = await prisma.location.create({ data: { tenantId: owner.tenantId, warehouseId, code: `${marker}_LOC`, name: marker } }); locationId = location.id;
    await prisma.stockLevel.create({ data: { tenantId: owner.tenantId, productId: raw.id, warehouseId, locationId, quantity: 100 } });
    const wc = await prisma.workCenter.create({ data: { tenantId: owner.tenantId, code: `${marker}_WC`, name: marker, capacity: 8, laborRate: 10, overheadRate: 5 } }); workCenterId = wc.id;
    const bom = await prisma.bOM.create({ data: { tenantId: owner.tenantId, productId: fg.id, name: marker, version: '1.0', items: { create: { tenantId: owner.tenantId, productId: raw.id, quantity: 2 } }, routings: { create: { tenantId: owner.tenantId, workCenterId, name: `${marker} Operasyon`, stepOrder: 1, setupTime: 60, runTime: 30 } } } }); bomId = bom.id;
    const otherBom = await prisma.bOM.create({ data: { tenantId: owner.tenantId, productId: other.id, name: `${marker}_OTHER_BOM`, version: '1.0' } });
    const foreignProduct = await prisma.product.findFirstOrThrow({ where: { tenantId: foreign.tenantId, deletedAt: null } }); const foreignWarehouse = await prisma.warehouse.findFirstOrThrow({ where: { tenantId: foreign.tenantId } });
    assert.equal((await api(owner, '', 'POST', { productId: foreignProduct.id, plannedQty: 1 })).status, 404);
    assert.equal((await api(owner, '', 'POST', { productId: fg.id, plannedQty: 1, inputWarehouseId: foreignWarehouse.id })).status, 404);
    assert.equal((await api(owner, '', 'POST', { productId: fg.id, bomId: otherBom.id, plannedQty: 1 })).status, 400);

    const created = await api(owner, '', 'POST', { productId: fg.id, bomId, plannedQty: 10, startDate: new Date().toISOString(), notes: 'Türkçe TEST notu', inputWarehouseId: warehouseId, outputWarehouseId: warehouseId }); assert.equal(created.status, 201); workOrderId = created.body.data.id;
    const row = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, include: { items: true, operations: true, history: true } }); assert.equal(row.tenantId, owner.tenantId); assert.equal(Number(row.plannedQty), 10); assert.equal(row.items.length, 1); assert.equal(Number(row.items[0]!.requiredQty), 20); assert.equal(row.operations.length, 1); assert.equal(row.history[0]?.toStatus, 'PLANNED'); assert.equal(Number(row.estimatedMaterialCost), 80);
    const searched = await api(owner, `?search=${encodeURIComponent(marker)}&page=1&limit=1`); assert.equal(searched.status, 200); assert.equal(searched.body.meta.total >= 1, true); assert.equal(searched.body.data[0].id, workOrderId);
    assert.equal((await api(foreign, `/${workOrderId}`)).status, 404);
    assert.equal((await api(owner, `/${workOrderId}/status`, 'POST', { status: 'INVALID' })).status, 400);
    assert.equal((await api(owner, `/${workOrderId}/items`, 'POST', { productId: raw.id, requiredQty: 'x' })).status, 400);
    assert.equal((await api(owner, `/${workOrderId}/items`, 'POST', { productId: raw.id, requiredQty: 1, sourceWarehouseId: foreignWarehouse.id })).status, 404);

    const starts = await Promise.all([api(owner, `/${workOrderId}/status`, 'POST', { status: 'IN_PROGRESS' }), api(owner, `/${workOrderId}/status`, 'POST', { status: 'IN_PROGRESS' })]); assert.equal(starts.filter((r) => r.status === 200).length, 1); assert.equal(starts.every((r) => [200, 400, 409].includes(r.status)), true);
    const reservations = await prisma.inventoryReservation.findMany({ where: { tenantId: owner.tenantId, refType: 'WORK_ORDER', refId: workOrderId, releasedAt: null } }); assert.equal(reservations.length, 1); assert.equal(Number(reservations[0]!.quantity), 20);
    const detail = await api(owner, `/${workOrderId}`); assert.equal(detail.status, 200); const itemId = detail.body.data.items[0].id; const operationId = detail.body.data.operations[0].id;
    assert.equal((await api(owner, `/${workOrderId}/operations/${operationId}`, 'PATCH', { status: 'INVALID' })).status, 400); assert.equal((await api(owner, `/${workOrderId}/operations/${operationId}`, 'PATCH', { actualStartAt: 'invalid' })).status, 400); assert.equal((await api(owner, `/${workOrderId}/operations/${operationId}`, 'PATCH', { actualStartAt: '2026-01-02T00:00:00.000Z', actualEndAt: '2026-01-01T00:00:00.000Z' })).status, 400);
    assert.equal((await api(owner, `/${workOrderId}/report`, 'POST', { producedQty: 1, operationId: 'missing-operation' })).status, 404);
    assert.equal((await api(owner, `/${workOrderId}/report`, 'POST', { producedQty: 0 })).status, 400);
    assert.equal((await api(owner, `/${workOrderId}/report`, 'POST', { producedQty: 1, consumptions: [{ itemId, quantity: 1 }, { itemId, quantity: 1 }] })).status, 400);
    assert.equal((await api(owner, `/${workOrderId}/report`, 'POST', { producedQty: 1, consumptions: [{ itemId, quantity: 999 }] })).status, 409);
    const racingReports = await Promise.all([api(owner, `/${workOrderId}/report`, 'POST', { producedQty: 1, consumptions: [{ itemId, quantity: 60 }] }), api(owner, `/${workOrderId}/report`, 'POST', { producedQty: 1, consumptions: [{ itemId, quantity: 60 }] })]); assert.equal(racingReports.filter((r) => r.status === 200).length, 1); assert.equal(racingReports.filter((r) => r.status === 409).length, 1);
    const afterRace = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, include: { items: true } }); assert.equal(Number(afterRace.producedQty), 1); assert.equal(Number(afterRace.items[0]!.consumedQty), 60); assert.equal(Number((await prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId_locationId: { productId: raw.id, warehouseId, locationId } } })).quantity), 40); assert.equal(await prisma.stockMovement.count({ where: { tenantId: owner.tenantId, refType: 'WORK_ORDER', refId: workOrderId, type: 'OUT' } }), 1); assert.equal(await prisma.stockValuation.count({ where: { tenantId: owner.tenantId, productId: raw.id, warehouseId } }), 1);
    const reported = await api(owner, `/${workOrderId}/report`, 'POST', { producedQty: 6, scrapQty: 1, scrapReason: 'TEST fire', operationId, consumptions: [{ itemId, quantity: 5 }], notes: 'TEST üretim' }); assert.equal(reported.status, 200);
    const afterReport = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, include: { items: true, operations: true } }); assert.equal(Number(afterReport.producedQty), 7); assert.equal(Number(afterReport.scrapQty), 1); assert.equal(Number(afterReport.items[0]!.consumedQty), 65); assert.equal(afterReport.operations[0]!.status, 'COMPLETED'); assert.equal(Number(afterReport.actualMaterialCost), 260); assert.equal(Number((await prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId_locationId: { productId: raw.id, warehouseId, locationId } } })).quantity), 35);
    assert.equal((await api(owner, `/${workOrderId}/operations/${operationId}`, 'PATCH', { status: 'PLANNED' })).status, 400);
    assert.equal(await prisma.stockMovement.count({ where: { tenantId: owner.tenantId, refType: 'WORK_ORDER', refId: workOrderId, type: 'OUT' } }), 2); assert.equal(await prisma.stockValuation.count({ where: { tenantId: owner.tenantId, productId: raw.id, warehouseId } }), 2);

    const completions = await Promise.all([api(owner, `/${workOrderId}/status`, 'POST', { status: 'COMPLETED' }), api(owner, `/${workOrderId}/status`, 'POST', { status: 'COMPLETED' })]); assert.equal(completions.some((r) => r.status === 200), true); assert.equal(completions.every((r) => [200, 409].includes(r.status)), true);
    assert.equal(await prisma.stockMovement.count({ where: { tenantId: owner.tenantId, refType: 'WORK_ORDER', refId: workOrderId, type: 'IN' } }), 1); assert.equal(Number((await prisma.stockLevel.findFirstOrThrow({ where: { tenantId: owner.tenantId, productId: fg.id, warehouseId } })).quantity), 7); assert.equal(await prisma.inventoryReservation.count({ where: { tenantId: owner.tenantId, refType: 'WORK_ORDER', refId: workOrderId, releasedAt: null } }), 0);
    assert.equal((await api(owner, `/${workOrderId}/items`, 'POST', { productId: raw.id, requiredQty: 1 })).status, 400);
    const removed = await api(owner, `/${workOrderId}`, 'DELETE'); assert.equal(removed.status, 200); assert.equal((await api(owner, `/${workOrderId}`)).status, 404); assert.notEqual((await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId } })).deletedAt, null);
    await prisma.bOM.delete({ where: { id: otherBom.id } });
    console.log('PASS work orders assurance: CRUD, validation, ownership, BOM explosion, search/pagination, transitions, concurrency, reservations, production, stock, valuation, costing, completion idempotency and soft delete');
  } finally {
    await prisma.auditLog.deleteMany({ where: { tenantId: owner.tenantId, entityId: workOrderId } }); await prisma.inventoryReservation.deleteMany({ where: { tenantId: owner.tenantId, refId: workOrderId } }); await prisma.stockValuation.deleteMany({ where: { tenantId: owner.tenantId, productId: { in: productIds } } }); await prisma.stockMovement.deleteMany({ where: { tenantId: owner.tenantId, refId: workOrderId } }); await prisma.stockLevel.deleteMany({ where: { tenantId: owner.tenantId, productId: { in: productIds } } }); if (workOrderId) await prisma.workOrder.deleteMany({ where: { id: workOrderId } }); await prisma.bOM.deleteMany({ where: { tenantId: owner.tenantId, productId: { in: productIds } } }); if (workCenterId) await prisma.workCenter.deleteMany({ where: { id: workCenterId } }); await prisma.product.deleteMany({ where: { id: { in: productIds } } }); if (locationId) await prisma.location.deleteMany({ where: { id: locationId } }); if (warehouseId) await prisma.warehouse.deleteMany({ where: { id: warehouseId } }); await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
