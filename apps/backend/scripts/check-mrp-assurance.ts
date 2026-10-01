import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { getMrpPlanning } from '../src/modules/production/infrastructure/services/mrp-planning.service.js';

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_MRP_${Date.now()}`;
type Session = { cookie: string; tenantId: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug }) });
  assert.equal(response.status, 200); const body = await response.json() as any;
  return { cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', tenantId: body.data.tenant.id };
}
async function api(session: Session | null, query = '') { const response = await fetch(`${baseUrl}/api/production/mrp${query}`, { headers: { origin, ...(session ? { cookie: session.cookie } : {}) } }); return { status: response.status, body: await response.json().catch(() => null) as any }; }

async function main() {
  const owner = await login('admin@axondemo.com', 'axon-demo'); const unauthorized = await login('muhasebe@axondemo.com', 'axon-demo'); const foreign = await login('pro@axondemo.com', 'axon-pro-demo');
  const productIds: string[] = []; const extraBomIds: string[] = []; const extraSalesOrderIds: string[] = []; let workCenterId = ''; let bomId = ''; let salesOrderId = ''; let workOrderId = ''; let purchaseRequestId = ''; let purchaseOrderId = ''; let locationId = '';
  try {
    assert.equal((await api(null)).status, 401); assert.equal((await api(unauthorized)).status, 403);
    for (const value of ['abc', '30abc', '7.5', '0', '6', '181']) assert.equal((await api(owner, `?horizonDays=${value}`)).status, 400);
    const mutationCountsBeforeGate = await Promise.all([prisma.workOrder.count({ where: { tenantId: owner.tenantId } }), prisma.purchaseRequest.count({ where: { tenantId: owner.tenantId } }), prisma.purchaseOrder.count({ where: { tenantId: owner.tenantId } })]);
    const gatedBaseline = await api(owner, '?horizonDays=7');
    assert.ok([200, 409].includes(gatedBaseline.status));
    if (gatedBaseline.status === 409) assert.equal(gatedBaseline.body?.data, undefined, 'truth gate must not return stale planning data');
    assert.deepEqual(await Promise.all([prisma.workOrder.count({ where: { tenantId: owner.tenantId } }), prisma.purchaseRequest.count({ where: { tenantId: owner.tenantId } }), prisma.purchaseOrder.count({ where: { tenantId: owner.tenantId } })]), mutationCountsBeforeGate, 'MRP GET/truth gate must not mutate planning records');
    const category = await prisma.category.findFirstOrThrow({ where: { tenantId: owner.tenantId } }); const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: owner.tenantId } }); const contact = await prisma.contact.findFirstOrThrow({ where: { tenantId: owner.tenantId } }); const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { tenantId: owner.tenantId, isActive: true }, orderBy: { code: 'asc' } });
    const finished = await prisma.product.create({ data: { tenantId: owner.tenantId, categoryId: category.id, unitId: unit.id, code: `${marker}_FG`, name: `${marker} Mamul`, minStockLevel: 2 } }); productIds.push(finished.id);
    const component = await prisma.product.create({ data: { tenantId: owner.tenantId, categoryId: category.id, unitId: unit.id, code: `${marker}_RM`, name: `${marker} Bileşen`, minStockLevel: 1 } }); productIds.push(component.id);
    const wc = await prisma.workCenter.create({ data: { tenantId: owner.tenantId, code: `${marker}_WC`, name: `${marker} Merkezi`, capacity: 2 } }); workCenterId = wc.id;
    const bom = await prisma.bOM.create({ data: { tenantId: owner.tenantId, productId: finished.id, name: marker, version: '1.0', isActive: true, items: { create: { tenantId: owner.tenantId, productId: component.id, quantity: 3 } }, routings: { create: [{ tenantId: owner.tenantId, workCenterId, name: 'Hazırlık', stepOrder: 1, setupTime: 60, runTime: 30 }, { tenantId: owner.tenantId, workCenterId, name: 'Montaj', stepOrder: 2, setupTime: 60, runTime: 30 }] } } }); bomId = bom.id;
    const existingLocation = await prisma.location.findFirst({ where: { tenantId: owner.tenantId, warehouseId: warehouse.id, isActive: true } });
    const location = existingLocation ?? await prisma.location.create({ data: { tenantId: owner.tenantId, warehouseId: warehouse.id, code: `${marker}_LOC`, name: marker } }); if (!existingLocation) locationId = location.id;
    await prisma.stockLevel.createMany({ data: [{ tenantId: owner.tenantId, productId: finished.id, warehouseId: warehouse.id, locationId: location.id, quantity: 5 }, { tenantId: owner.tenantId, productId: component.id, warehouseId: warehouse.id, locationId: location.id, quantity: 20 }] });
    await prisma.inventoryReservation.createMany({ data: [{ tenantId: owner.tenantId, productId: finished.id, warehouseId: warehouse.id, quantity: 2, refType: 'OTHER', refId: marker }, { tenantId: owner.tenantId, productId: component.id, warehouseId: warehouse.id, quantity: 5, refType: 'OTHER', refId: marker }] });
    const today = new Date(); today.setUTCHours(0, 0, 0, 0); const day6End = new Date(today); day6End.setUTCDate(day6End.getUTCDate() + 6); day6End.setUTCHours(23, 59, 59, 999); const day7 = new Date(day6End.getTime() + 1);
    const so = await prisma.salesOrder.create({ data: { tenantId: owner.tenantId, contactId: contact.id, number: `${marker}_SO`, date: new Date(), dueDate: day6End, status: 'CONFIRMED', items: { create: { tenantId: owner.tenantId, productId: finished.id, quantity: 20, delivered: 0, unitPrice: 1, lineTotal: 20 } } } }); salesOrderId = so.id;
    const wo = await prisma.workOrder.create({ data: { tenantId: owner.tenantId, productId: finished.id, bomId, number: `${marker}_WO`, status: 'PLANNED', plannedQty: 4, producedQty: 0, endDate: day6End } }); workOrderId = wo.id;
    const pr = await prisma.purchaseRequest.create({ data: { tenantId: owner.tenantId, number: `${marker}_PR`, date: new Date(), status: 'APPROVED', items: { create: { tenantId: owner.tenantId, productId: component.id, quantity: 10 } } } }); purchaseRequestId = pr.id;

    const result = await getMrpPlanning(prisma, { tenantId: owner.tenantId, horizonDays: 7 });
    const production = result.productionRecommendations.find((row) => row.product.id === finished.id)!;
    assert.equal(production.openSalesOrderQty, 20); assert.equal(production.safetyStockQty, 2); assert.equal(production.stockQty, 3); assert.equal(production.openWorkOrderQty, 4); assert.equal(production.recommendedQty, 15);
    assert.equal(production.capacityHours, 17); assert.equal(production.capacityAvailableHours, 14); assert.equal(production.capacityGapHours, 3);
    const purchase = result.purchaseRecommendations.find((row) => row.product.id === component.id)!;
    assert.equal(purchase.grossRequirementQty, 46); assert.equal(purchase.stockQty, 15); assert.equal(purchase.openPurchaseQty, 10); assert.equal(purchase.recommendedQty, 21);
    const capacity = result.capacityRecommendations.find((row) => row.workCenter.id === workCenterId)!; assert.equal(capacity.requiredHours, 17); assert.equal(capacity.availableHours, 14); assert.equal(capacity.gapHours, 3);

    for (const [status, expectedSupply] of [['DRAFT', 0], ['PENDING_APPROVAL', 0], ['APPROVED', 10], ['ORDERED', 0], ['REJECTED', 0], ['CANCELLED', 0]] as const) {
      await prisma.purchaseRequest.update({ where: { id: purchaseRequestId }, data: { status } });
      const statusResult = await getMrpPlanning(prisma, { tenantId: owner.tenantId, horizonDays: 7 });
      assert.equal(statusResult.purchaseRecommendations.find((row) => row.product.id === component.id)?.openPurchaseQty, expectedSupply, `PR ${status}`);
    }
    const po = await prisma.purchaseOrder.create({ data: { tenantId: owner.tenantId, contactId: contact.id, number: `${marker}_PO`, date: new Date(), status: 'SENT', items: { create: { tenantId: owner.tenantId, productId: component.id, quantity: 10, received: 0, unitPrice: 1, lineTotal: 10 } } } }); purchaseOrderId = po.id;
    await prisma.purchaseRequest.update({ where: { id: purchaseRequestId }, data: { status: 'ORDERED', purchaseOrderId } });
    let supplyResult = await getMrpPlanning(prisma, { tenantId: owner.tenantId, horizonDays: 7 });
    assert.equal(supplyResult.purchaseRecommendations.find((row) => row.product.id === component.id)?.openPurchaseQty, 10, 'PR -> PO supply must not be counted twice');
    for (const [status, received, expectedSupply] of [['DRAFT', 0, 0], ['SENT', 0, 10], ['PARTIALLY_RECEIVED', 4, 6], ['RECEIVED', 10, 0], ['CANCELLED', 0, 0]] as const) {
      await prisma.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status, items: { updateMany: { where: {}, data: { received } } } } });
      supplyResult = await getMrpPlanning(prisma, { tenantId: owner.tenantId, horizonDays: 7 });
      assert.equal(supplyResult.purchaseRecommendations.find((row) => row.product.id === component.id)?.openPurchaseQty ?? 0, expectedSupply, `PO ${status}`);
    }
    await prisma.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: 'PARTIALLY_RECEIVED', items: { updateMany: { where: {}, data: { received: 4 } } } } });
    await prisma.stockLevel.updateMany({ where: { tenantId: owner.tenantId, productId: component.id }, data: { quantity: 24 } });
    supplyResult = await getMrpPlanning(prisma, { tenantId: owner.tenantId, horizonDays: 7 });
    assert.equal(supplyResult.purchaseRecommendations.find((row) => row.product.id === component.id)?.recommendedQty, 21, 'received stock plus remaining PO must be counted exactly once');
    await prisma.stockLevel.updateMany({ where: { tenantId: owner.tenantId, productId: component.id }, data: { quantity: 20 } });

    await prisma.inventoryReservation.updateMany({ where: { tenantId: owner.tenantId, productId: finished.id, refId: marker }, data: { releasedAt: new Date() } });
    let reservationResult = await getMrpPlanning(prisma, { tenantId: owner.tenantId, horizonDays: 7 });
    assert.equal(reservationResult.productionRecommendations.find((row) => row.product.id === finished.id)?.stockQty, 5);
    await prisma.inventoryReservation.updateMany({ where: { tenantId: owner.tenantId, productId: finished.id, refId: marker }, data: { releasedAt: null, expiresAt: new Date(Date.now() - 60_000), quantity: 100 } });
    reservationResult = await getMrpPlanning(prisma, { tenantId: owner.tenantId, horizonDays: 7 });
    assert.equal(reservationResult.productionRecommendations.find((row) => row.product.id === finished.id)?.stockQty, 5, 'expired reservation ignored');
    await prisma.inventoryReservation.updateMany({ where: { tenantId: owner.tenantId, productId: finished.id, refId: marker }, data: { expiresAt: null } });
    reservationResult = await getMrpPlanning(prisma, { tenantId: owner.tenantId, horizonDays: 7 });
    assert.equal(reservationResult.productionRecommendations.find((row) => row.product.id === finished.id)?.stockQty, 0, 'over-reservation clamps available stock at zero');

    const fg2 = await prisma.product.create({ data: { tenantId: owner.tenantId, categoryId: category.id, unitId: unit.id, code: `${marker}_FG2`, name: `${marker} FG-A`, minStockLevel: 0 } }); productIds.push(fg2.id);
    const sub = await prisma.product.create({ data: { tenantId: owner.tenantId, categoryId: category.id, unitId: unit.id, code: `${marker}_SUB`, name: `${marker} SUB-B`, minStockLevel: 0 } }); productIds.push(sub.id);
    const raw = await prisma.product.create({ data: { tenantId: owner.tenantId, categoryId: category.id, unitId: unit.id, code: `${marker}_RAW`, name: `${marker} RAW-C`, minStockLevel: 0 } }); productIds.push(raw.id);
    const fgBom = await prisma.bOM.create({ data: { tenantId: owner.tenantId, productId: fg2.id, name: `${marker}_FG_BOM`, version: '1.0', items: { create: { tenantId: owner.tenantId, productId: sub.id, quantity: 2 } } } }); extraBomIds.push(fgBom.id);
    const subBom = await prisma.bOM.create({ data: { tenantId: owner.tenantId, productId: sub.id, name: `${marker}_SUB_BOM`, version: '1.0', items: { create: { tenantId: owner.tenantId, productId: raw.id, quantity: 3 } } } }); extraBomIds.push(subBom.id);
    const nestedSo = await prisma.salesOrder.create({ data: { tenantId: owner.tenantId, contactId: contact.id, number: `${marker}_SO_NESTED`, date: new Date(), dueDate: day6End, status: 'CONFIRMED', items: { create: { tenantId: owner.tenantId, productId: fg2.id, quantity: 10, delivered: 0, unitPrice: 1, lineTotal: 10 } } } }); extraSalesOrderIds.push(nestedSo.id);
    let nested = await getMrpPlanning(prisma, { tenantId: owner.tenantId, horizonDays: 7 });
    assert.equal(nested.productionRecommendations.find((row) => row.product.id === fg2.id)?.recommendedQty, 10);
    assert.equal(nested.productionRecommendations.find((row) => row.product.id === sub.id)?.demandQty, 20);
    assert.equal(nested.productionRecommendations.find((row) => row.product.id === sub.id)?.recommendedQty, 20);
    assert.equal(nested.purchaseRecommendations.find((row) => row.product.id === raw.id)?.grossRequirementQty, 60);
    await prisma.stockLevel.create({ data: { tenantId: owner.tenantId, productId: sub.id, warehouseId: warehouse.id, locationId: location.id, quantity: 5 } });
    nested = await getMrpPlanning(prisma, { tenantId: owner.tenantId, horizonDays: 7 });
    assert.equal(nested.productionRecommendations.find((row) => row.product.id === sub.id)?.recommendedQty, 15);
    assert.equal(nested.purchaseRecommendations.find((row) => row.product.id === raw.id)?.grossRequirementQty, 45, 'child raw demand must use net subassembly production');
    const cycleBom = await prisma.bOM.create({ data: { tenantId: owner.tenantId, productId: raw.id, name: `${marker}_CYCLE`, version: '1.0', items: { create: { tenantId: owner.tenantId, productId: fg2.id, quantity: 1 } } } }); extraBomIds.push(cycleBom.id);
    await assert.rejects(() => getMrpPlanning(prisma, { tenantId: owner.tenantId, horizonDays: 7 }), /BOM d.*ng.*s.*tespit edildi/);
    await prisma.bOM.delete({ where: { id: cycleBom.id } }); extraBomIds.pop();

    const yesterday = new Date(today); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await prisma.salesOrder.update({ where: { id: salesOrderId }, data: { date: yesterday, dueDate: day6End, status: 'PARTIALLY_DELIVERED', items: { updateMany: { where: {}, data: { delivered: 4 } } } } });
    const forecastResult = await getMrpPlanning(prisma, { tenantId: owner.tenantId, horizonDays: 7 });
    const forecastRow = forecastResult.productionRecommendations.find((row) => row.product.id === finished.id)!;
    assert.equal(forecastRow.openSalesOrderQty, 16);
    assert.ok(forecastRow.forecastDemandQty > 0 && forecastRow.forecastDemandQty < 4, 'forecast uses delivered history, not full open order');

    await prisma.salesOrder.update({ where: { id: salesOrderId }, data: { dueDate: day7 } });
    const outside = await getMrpPlanning(prisma, { tenantId: owner.tenantId, horizonDays: 7 }); assert.equal(outside.productionRecommendations.some((row) => row.product.id === finished.id), false);
    const wider = await getMrpPlanning(prisma, { tenantId: owner.tenantId, horizonDays: 8 }); assert.equal(wider.productionRecommendations.some((row) => row.product.id === finished.id), true);
    const foreignResult = await getMrpPlanning(prisma, { tenantId: foreign.tenantId, horizonDays: 7 }); assert.equal(foreignResult.productionRecommendations.some((row) => productIds.includes(row.product.id)), false); assert.equal(foreignResult.purchaseRecommendations.some((row) => productIds.includes(row.product.id)), false);
    console.log(`PASS MRP assurance: validation, reservations, BOM explosion, supply, capacity deduplication, horizon and tenant isolation (baseline endpoint ${gatedBaseline.status})`);
  } finally {
    if (extraSalesOrderIds.length) await prisma.salesOrder.deleteMany({ where: { id: { in: extraSalesOrderIds } } }); if (salesOrderId) await prisma.salesOrder.deleteMany({ where: { id: salesOrderId } }); if (workOrderId) await prisma.workOrder.deleteMany({ where: { id: workOrderId } }); if (purchaseRequestId) await prisma.purchaseRequest.deleteMany({ where: { id: purchaseRequestId } }); if (purchaseOrderId) await prisma.purchaseOrder.deleteMany({ where: { id: purchaseOrderId } });
    await prisma.inventoryReservation.deleteMany({ where: { refId: marker } }); await prisma.stockLevel.deleteMany({ where: { productId: { in: productIds } } }); if (extraBomIds.length) await prisma.bOM.deleteMany({ where: { id: { in: extraBomIds } } }); if (bomId) await prisma.bOM.deleteMany({ where: { id: bomId } }); if (workCenterId) await prisma.workCenter.deleteMany({ where: { id: workCenterId } }); await prisma.product.deleteMany({ where: { id: { in: productIds } } }); if (locationId) await prisma.location.deleteMany({ where: { id: locationId } }); await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
