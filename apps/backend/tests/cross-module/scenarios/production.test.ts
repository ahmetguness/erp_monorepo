import { expect, test } from 'vitest';
import { z } from 'zod';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { create, data, request } from '../support/http.js';
import { addStock, assertBalancedJournal, assertTenantBoundary, stock } from '../support/invariants.js';
import { getMrpPlanning } from '../../../src/modules/production/infrastructure/services/mrp-planning.service.js';
import { exerciseInventoryEvidence } from '../support/inventory-evidence.js';

isolatedDatabase();

test('C: BOM → planning → material reservation/consumption → finished goods is repeat-safe', async () => {
  const { a, b } = await fixture();
  await addStock(a, 10);
  const finished = await db.product.create({ data: { tenantId: a.tenant.id, unitId: a.unit.id, code: 'FINISHED', name: 'Finished product' } });
  const bomId = await create('/api/production/boms', a.identity, { productId: finished.id, name: 'Assembly', items: [{ productId: a.product.id, quantity: 2 }] });
  // A new tenant has no evidence for every required inventory movement type.
  // Verify the HTTP gate fails closed, then exercise the planner against real
  // sales demand below that gate without changing production access policy.
  expect((await request('GET', '/api/production/mrp', a.identity)).status).toBe(409);
  await create('/api/sales-orders', a.identity, { contactId: a.contact.id, date: new Date().toISOString().slice(0, 10),
    items: [{ productId: finished.id, quantity: 2, unitPrice: 100 }] });
  const planning = await getMrpPlanning(db, { tenantId: a.tenant.id, horizonDays: 30 });
  expect(planning.summary.openSalesOrderQty).toBe(2);
  expect(planning.summary.productionRecommendationCount).toBeGreaterThan(0);
  expect((await request('GET', '/api/production/capacity-planning', a.identity)).status).toBe(200);
  const id = await create('/api/production/work-orders', a.identity, { productId: finished.id, bomId, plannedQty: 2,
    inputWarehouseId: a.warehouse.id, outputWarehouseId: a.warehouse.id, qualityRequired: true });
  const item = await db.workOrderItem.findFirstOrThrow({ where: { tenantId: a.tenant.id, workOrderId: id } });
  expect(item.requiredQty.toString()).toBe('4');
  expect((await request('POST', `/api/production/work-orders/${id}/status`, a.identity, { status: 'IN_PROGRESS' })).status).toBe(200);
  const before = await stock(a);
  expect((await request('POST', `/api/production/work-orders/${id}/report`, a.identity, { producedQty: 2, consumptions: [{ itemId: item.id, quantity: 1_000_000_000 }] })).status).toBe(409);
  expect((await stock(a)).equals(before)).toBe(true);
  expect((await db.workOrderItem.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: item.id } })).consumedQty.isZero()).toBe(true);
  expect((await request('POST', `/api/production/work-orders/${id}/report`, a.identity, { producedQty: 2, scrapQty: 0, consumptions: [{ itemId: item.id, quantity: 4 }] })).status).toBe(200);
  expect((await request('GET', '/api/production/quality-control', a.identity)).status).toBe(200);
  expect((await request('POST', `/api/production/work-orders/${id}/quality-decisions`, a.identity,
    { decision: 'APPROVED', reason: 'BOM material and output inspection passed', idempotencyKey: `inspection-${id}` })).status).toBe(200);
  const complete = () => request('POST', `/api/production/work-orders/${id}/status`, a.identity, { status: 'COMPLETED' });
  const completions = await Promise.all([complete(), complete()]);
  expect(completions.some((result) => result.status === 200)).toBe(true);
  expect(completions.every((result) => result.status === 200 || result.status === 409)).toBe(true);
  const movements = await db.stockMovement.count({ where: { tenantId: a.tenant.id, refId: id } });
  expect((await request('POST', `/api/production/work-orders/${id}/status`, a.identity, { status: 'COMPLETED' })).status).toBe(200);
  expect(await db.stockMovement.count({ where: { tenantId: a.tenant.id, refId: id } })).toBe(movements);
  expect((await stock(a)).toString()).toBe('6');
  const output = await db.stockLevel.aggregate({ where: { tenantId: a.tenant.id, productId: finished.id }, _sum: { quantity: true } });
  expect(output._sum.quantity?.toString()).toBe('2');
  const outputMovement = await db.stockMovement.findFirstOrThrow({ where: { tenantId: a.tenant.id, refId: id, type: 'IN' } });
  expect(outputMovement.unitCost?.toString()).toBe('80');
  expect(outputMovement.totalCost?.toString()).toBe('160');
  const valuation = await db.stockValuation.findFirstOrThrow({ where: { tenantId: a.tenant.id, movementId: outputMovement.id } });
  expect(valuation.totalValue.toString()).toBe('160');
  await assertBalancedJournal(a.tenant.id, id);
  expect(await db.inventoryReservation.count({ where: { tenantId: a.tenant.id, refId: id, releasedAt: null } })).toBe(0);
  await assertTenantBoundary(a, b, `/api/production/work-orders/${id}`);
  await exerciseInventoryEvidence(a);
  const gate = data(await request('GET', '/api/stock/truth-gate', a.identity), 200,
    z.object({ checks: z.array(z.object({ key: z.string(), status: z.string() })) }));
  expect(gate.checks.filter((check) => check.status !== 'PASS')).toEqual([]);
  expect((await request('GET', '/api/production/mrp', a.identity)).status).toBe(200);
});

test('C: actual routing allocation exposes overload, scrap and blocked quality output', async () => {
  const { a, b } = await fixture();
  await addStock(a, 10);
  const finished = await db.product.create({ data: { tenantId: a.tenant.id, unitId: a.unit.id, code: 'SCRAP-FG', name: 'Quality product' } });
  const center = await db.workCenter.create({ data: { tenantId: a.tenant.id, code: 'CAPACITY', name: 'Constrained center', capacity: 1, laborRate: 10 } });
  const bomId = await create('/api/production/boms', a.identity, { productId: finished.id, name: 'Scrap assembly', items: [{ productId: a.product.id, quantity: 2 }] });
  await db.routingOperation.create({ data: { tenantId: a.tenant.id, bomId, workCenterId: center.id, name: 'Assembly', stepOrder: 1, runTime: 120 } });
  const id = await create('/api/production/work-orders', a.identity, { productId: finished.id, bomId, plannedQty: 2,
    startDate: new Date().toISOString(), inputWarehouseId: a.warehouse.id, outputWarehouseId: a.warehouse.id });
  expect((await request('POST', `/api/production/work-orders/${id}/status`, a.identity, { status: 'IN_PROGRESS' })).status).toBe(200);
  const capacity = await db.workCenterCapacity.findFirstOrThrow({ where: { tenantId: a.tenant.id, workCenterId: center.id } });
  expect(capacity.allocated.toString()).toBe('4');
  expect(capacity.capacity.toString()).toBe('1');
  const planning = data(await request('GET', '/api/production/capacity-planning?horizonDays=7', a.identity), 200,
    z.object({ summary: z.object({ criticalBottleneckCount: z.number() }) }));
  expect(planning.summary.criticalBottleneckCount).toBeGreaterThan(0);
  const item = await db.workOrderItem.findFirstOrThrow({ where: { tenantId: a.tenant.id, workOrderId: id } });
  expect((await request('POST', `/api/production/work-orders/${id}/report`, a.identity, { producedQty: 1, scrapQty: 1,
    consumptions: [{ itemId: item.id, quantity: 4 }] })).status).toBe(200);
  const quality = data(await request('GET', '/api/production/quality-control', a.identity), 200,
    z.object({ outputForms: z.array(z.object({ workOrderId: z.string(), status: z.string() })),
      nonconformities: z.array(z.object({ workOrderId: z.string(), type: z.string(), quantityImpact: z.number() })) }));
  expect(quality.outputForms.find((form) => form.workOrderId === id)?.status).toBe('blocked');
  expect(quality.nonconformities).toContainEqual(expect.objectContaining({ workOrderId: id, type: 'scrap', quantityImpact: 1 }));
  expect((await stock(a)).toString()).toBe('6');
  expect((await db.workOrder.findFirstOrThrow({ where: { tenantId: a.tenant.id, id } })).scrapQty?.toString()).toBe('1');
  expect(await db.stockMovement.count({ where: { tenantId: a.tenant.id, productId: finished.id } })).toBe(0);
  const foreign = data(await request('GET', '/api/production/quality-control', b.identity), 200,
    z.object({ outputForms: z.array(z.object({ workOrderId: z.string() })) }));
  expect(foreign.outputForms.some((form) => form.workOrderId === id)).toBe(false);
});

test('C: foreign BOM input is rejected without creating material or work order records', async () => {
  const { a, b, limited } = await fixture();
  expect((await request('POST', '/api/production/work-orders', limited, { productId: a.product.id, plannedQty: 1 })).status).toBe(403);
  expect((await request('POST', '/api/production/boms', a.identity, { productId: a.product.id, name: 'Foreign material', items: [{ productId: b.product.id, quantity: 1 }] })).status).toBe(404);
  expect(await db.workOrder.count({ where: { tenantId: a.tenant.id } })).toBe(0);
  expect(await db.bOM.count({ where: { tenantId: a.tenant.id } })).toBe(0);
});
