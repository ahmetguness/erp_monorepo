import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { create, request } from '../support/http.js';

isolatedDatabase();

test('C: additional production invalidates approval and old retries cannot approve uninspected quantity', async () => {
  const { a } = await fixture();
  const id = await create('/api/production/work-orders', a.identity, { productId: a.product.id, plannedQty: 3,
    qualityRequired: true, outputWarehouseId: a.warehouse.id });
  expect((await request('POST', `/api/production/work-orders/${id}/status`, a.identity, { status: 'IN_PROGRESS' })).status).toBe(200);
  const report = () => request('POST', `/api/production/work-orders/${id}/report`, a.identity, { producedQty: 1 });
  expect((await report()).status).toBe(200);
  const input = { decision: 'APPROVED', reason: 'Initial inspected batch', idempotencyKey: randomUUID() };
  const path = `/api/production/work-orders/${id}/quality-decisions`;
  expect((await request('POST', path, a.identity, input)).status).toBe(200);
  expect((await report()).status).toBe(200);
  expect((await request('POST', path, a.identity, input)).status).toBe(200);
  expect((await db.workOrder.findFirstOrThrow({ where: { tenantId: a.tenant.id, id } })).qualityStatus).toBe('PENDING');
  expect((await request('POST', `/api/production/work-orders/${id}/status`, a.identity, { status: 'COMPLETED' })).status).toBe(409);
  expect(await db.stockMovement.count({ where: { tenantId: a.tenant.id, refId: id } })).toBe(0);
  expect((await request('POST', path, a.identity, { ...input, reason: 'Both produced units passed', idempotencyKey: randomUUID() })).status).toBe(200);
  const completePath = `/api/production/work-orders/${id}/automation/auto-complete`;
  expect((await request('POST', completePath, a.identity, { outputQty: 3 })).status).toBe(409);
  const completions = await Promise.all([request('POST', completePath, a.identity, {}), request('POST', completePath, a.identity, {})]);
  expect(completions.map((result) => result.status)).toEqual([200, 200]);
  expect((await request('POST', completePath, a.identity, {})).status).toBe(200);
  expect((await db.stockLevel.aggregate({ where: { tenantId: a.tenant.id, productId: a.product.id }, _sum: { quantity: true } }))._sum.quantity?.toString()).toBe('2');
  expect(await db.stockMovement.count({ where: { tenantId: a.tenant.id, refId: id } })).toBe(1);
  expect(await db.stockValuation.count({ where: { tenantId: a.tenant.id, productId: a.product.id } })).toBe(1);
});
