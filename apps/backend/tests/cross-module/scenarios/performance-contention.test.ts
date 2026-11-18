import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { create, data, entitySchema, request } from '../support/http.js';
import { addStock, assertBalancedJournal, stock } from '../support/invariants.js';

isolatedDatabase();
test('performance contention: 25 consumers cannot take more than five available stock units', async () => {
  const { a } = await fixture(); await addStock(a, 5);
  const responses = await Promise.all(Array.from({ length: 25 }, () => request('POST', '/api/stock/movements', a.identity, {
    productId: a.product.id, warehouseId: a.warehouse.id, type: 'OUT', quantity: 1, idempotencyKey: randomUUID(),
  })));
  expect(responses.filter((response) => response.status === 201)).toHaveLength(5);
  expect(responses.filter((response) => response.status === 400 || response.status === 409)).toHaveLength(20);
  expect((await stock(a)).toString()).toBe('0');
  expect(await db.stockMovement.count({ where: { tenantId: a.tenant.id, type: 'OUT' } })).toBe(5);
});
test('performance contention: 25 payment retries produce one allocation and balanced financial effects', async () => {
  const { a } = await fixture();
  const invoiceId = await create('/api/invoices', a.identity, { contactId: a.contact.id, type: 'SALES', date: '2026-11-17',
    lines: [{ productId: a.product.id, description: 'Synthetic contention invoice', quantity: 1, unitPrice: 100 }] });
  expect((await request('POST', `/api/invoices/${invoiceId}/approve`, a.identity, { idempotencyKey: randomUUID() })).status).toBe(200);
  const payment = { contactId: a.contact.id, cashAccountId: a.cash.id, date: '2026-11-17', amount: 100, direction: 'RECEIVE', method: 'CASH', idempotencyKey: randomUUID(), allocations: [{ invoiceId, amount: 100 }] };
  const responses = await Promise.all(Array.from({ length: 25 }, () => request('POST', '/api/payments', a.identity, payment)));
  const ids = responses.map((response) => data(response, 201, entitySchema).id);
  expect(new Set(ids).size).toBe(1);
  expect(await db.payment.count({ where: { tenantId: a.tenant.id } })).toBe(1);
  expect(await db.paymentAllocation.count({ where: { tenantId: a.tenant.id, invoiceId } })).toBe(1);
  await assertBalancedJournal(a.tenant.id, invoiceId);
});

test.each(['STARTER', 'PROFESSIONAL'] as const)('performance routing: %s team chat does not inherit the AI Enterprise policy', async (plan) => {
  const { a } = await fixture();
  await db.tenant.update({ where: { id: a.tenant.id }, data: { plan } });
  const conversation = await db.chatConversation.create({ data: { tenantId: a.tenant.id, type: 'GROUP', createdById: a.owner.id,
    members: { create: { tenantId: a.tenant.id, userId: a.owner.id, role: 'OWNER' } } } });
  expect((await request('POST', `/api/chat/conversations/${conversation.id}/messages`, a.identity, { clientMessageId: randomUUID(), content: 'Team collaboration is available.' })).status).toBe(201);
  const ai = await request('POST', '/api/chat', a.identity, { message: 'AI remains Enterprise-only.' });
  expect(ai.status).toBe(403);
  expect(ai.body).toMatchObject({ error: { code: 'PLAN_DOWNGRADE_LOCKED', details: { requiredPlan: 'ENTERPRISE' } } });
});
