import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { create, request } from '../support/http.js';

isolatedDatabase();

test('C: persisted rejection blocks every completion path; concurrent approval retries cannot release output twice', async () => {
  const { a, b, limited } = await fixture();
  const id = await create('/api/production/work-orders', a.identity, { productId: a.product.id, plannedQty: 2,
    outputWarehouseId: a.warehouse.id, qualityRequired: true });
  expect((await request('POST', `/api/production/work-orders/${id}/status`, a.identity, { status: 'IN_PROGRESS' })).status).toBe(200);
  expect((await request('POST', `/api/production/work-orders/${id}/report`, a.identity, { producedQty: 2 })).status).toBe(200);
  const path = `/api/production/work-orders/${id}/quality-decisions`;
  const rejection = { decision: 'REJECTED', reason: 'Output failed inspection', idempotencyKey: randomUUID() };
  expect((await request('POST', path, b.identity, rejection)).status).toBe(404);
  expect((await request('POST', path, limited, rejection)).status).toBe(403);
  expect((await request('POST', path, a.identity, rejection)).status).toBe(200);
  for (const suffix of ['/status', '/automation/auto-complete']) {
    expect((await request('POST', `/api/production/work-orders/${id}${suffix}`, a.identity, { status: 'COMPLETED' })).status).toBe(409);
  }
  expect(await db.stockMovement.count({ where: { tenantId: a.tenant.id, refId: id } })).toBe(0);
  const approval = { decision: 'APPROVED', reason: 'Reinspection passed', idempotencyKey: randomUUID() };
  const approvals = await Promise.all([request('POST', path, a.identity, approval), request('POST', path, a.identity, approval)]);
  expect(approvals.map((result) => result.status)).toEqual([200, 200]);
  expect((await request('POST', path, a.identity, rejection)).status).toBe(200);
  expect((await db.workOrder.findFirstOrThrow({ where: { tenantId: a.tenant.id, id } })).qualityStatus).toBe('APPROVED');
  expect((await request('POST', path, a.identity, { ...approval, decision: 'REJECTED' })).status).toBe(409);
  const complete = () => request('POST', `/api/production/work-orders/${id}/status`, a.identity, { status: 'COMPLETED' });
  const results = await Promise.all([complete(), complete()]);
  expect(results.some((result) => result.status === 200)).toBe(true);
  expect(results.every((result) => result.status === 200 || result.status === 409)).toBe(true);
  expect((await complete()).status).toBe(200);
  expect(await db.stockMovement.count({ where: { tenantId: a.tenant.id, refId: id, type: 'IN' } })).toBe(1);
  expect(await db.workOrderHistory.count({ where: { tenantId: a.tenant.id, workOrderId: id, qualityDecision: { not: null } } })).toBe(2);
});
