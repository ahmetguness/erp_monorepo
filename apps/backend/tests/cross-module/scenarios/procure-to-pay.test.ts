import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { z } from 'zod';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { create, data, entitySchema, request } from '../support/http.js';
import { assertBalancedJournal, assertTenantBoundary, stock } from '../support/invariants.js';

isolatedDatabase();

test('B: approved request → partial receipts → supplier invoice → payment reconciles with the database', async () => {
  const { a, b } = await fixture();
  const requestId = await create('/api/purchase-orders/requests', a.identity, {
    date: '2026-11-01', items: [{ productId: a.product.id, quantity: 3, unitPrice: 40 }],
  });
  expect((await request('POST', `/api/purchase-orders/requests/${requestId}/submit`, a.identity)).status).toBe(200);
  const approvals = await Promise.all([request('POST', `/api/purchase-orders/requests/${requestId}/approve`, a.identity), request('POST', `/api/purchase-orders/requests/${requestId}/approve`, a.identity)]);
  expect(approvals.map((result) => result.status).sort()).toEqual([200, 409]);
  const orderId = data(await request('POST', `/api/purchase-orders/requests/${requestId}/convert`, a.identity, { contactId: a.contact.id }), 201, entitySchema).id;
  expect((await request('POST', `/api/purchase-orders/${orderId}/send`, a.identity)).status).toBe(200);
  const item = await db.purchaseOrderItem.findFirstOrThrow({ where: { tenantId: a.tenant.id, orderId } });
  const receive = { idempotencyKey: randomUUID(), warehouseId: a.warehouse.id, items: [{ itemId: item.id, receivedQty: 2 }] };
  expect((await request('POST', `/api/purchase-orders/${orderId}/receive`, a.identity, receive)).status).toBe(200);
  expect((await request('POST', `/api/purchase-orders/${orderId}/receive`, a.identity, receive)).status).toBe(200);
  expect((await stock(a)).toString()).toBe('2');
  expect((await request('POST', `/api/purchase-orders/${orderId}/receive`, a.identity, { ...receive, items: [{ itemId: item.id, receivedQty: 1 }] })).status).toBe(409);
  expect((await stock(a)).toString()).toBe('2');
  const overReceipt = await request('POST', `/api/purchase-orders/${orderId}/receive`, a.identity, { ...receive, idempotencyKey: randomUUID(), items: [{ itemId: item.id, receivedQty: 2 }] });
  expect(overReceipt.status).toBe(400);
  expect((await stock(a)).toString()).toBe('2');
  const finalReceipt = { ...receive, idempotencyKey: randomUUID(), items: [{ itemId: item.id, receivedQty: 1 }] };
  expect((await Promise.all([request('POST', `/api/purchase-orders/${orderId}/receive`, a.identity, finalReceipt), request('POST', `/api/purchase-orders/${orderId}/receive`, a.identity, finalReceipt)])).map((result) => result.status)).toEqual([200, 200]);
  const invoiceId = await create('/api/invoices', a.identity, { contactId: a.contact.id, purchaseOrderId: orderId, type: 'PURCHASE', date: '2026-11-01',
    lines: [{ productId: a.product.id, description: 'Supplier goods', quantity: 3, unitPrice: 40 }] });
  expect((await request('POST', `/api/invoices/${invoiceId}/approve`, a.identity, { idempotencyKey: randomUUID() })).status).toBe(200);
  const payment = { contactId: a.contact.id, cashAccountId: a.cash.id, direction: 'SEND', method: 'CASH', date: '2026-11-01', amount: 120,
    idempotencyKey: randomUUID(), allocations: [{ invoiceId, amount: 120 }] };
  const payments = await Promise.all([request('POST', '/api/payments', a.identity, payment), request('POST', '/api/payments', a.identity, payment)]);
  expect(data(payments[0], 201, entitySchema).id).toBe(data(payments[1], 201, entitySchema).id);
  expect((await stock(a)).toString()).toBe('3');
  expect((await db.purchaseOrderItem.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: item.id } })).received.toString()).toBe('3');
  expect((await request('GET', `/api/purchase-orders/${orderId}/three-way-match`, a.identity)).status).toBe(200);
  await assertBalancedJournal(a.tenant.id, invoiceId);
  await assertTenantBoundary(a, b, `/api/purchase-orders/${orderId}`);
});

test('B: three-way match exposes over-invoicing instead of silently approving it', async () => {
  const { a } = await fixture();
  const orderId = await create('/api/purchase-orders', a.identity, { contactId: a.contact.id, date: '2026-11-01',
    items: [{ productId: a.product.id, quantity: 1, unitPrice: 40 }] });
  expect((await request('POST', `/api/purchase-orders/${orderId}/send`, a.identity)).status).toBe(200);
  const received = await db.purchaseOrderItem.findFirstOrThrow({ where: { tenantId: a.tenant.id, orderId } });
  expect((await request('POST', `/api/purchase-orders/${orderId}/receive`, a.identity, { warehouseId: a.warehouse.id,
    idempotencyKey: randomUUID(), items: [{ itemId: received.id, receivedQty: 1 }] })).status).toBe(200);
  const invoiceId = await create('/api/invoices', a.identity, { contactId: a.contact.id, purchaseOrderId: orderId,
    type: 'PURCHASE', date: '2026-11-01', lines: [{ productId: a.product.id, description: 'Excess supplier quantity', quantity: 2, unitPrice: 40 }] });
  const match = data(await request('GET', `/api/purchase-orders/${orderId}/three-way-match`, a.identity), 200,
    z.object({ summary: z.object({ status: z.string(), errorCount: z.number() }), lines: z.array(z.object({ issues: z.array(z.object({ code: z.string() })) })) }));
  expect(match.summary.status).toBe('EXCEPTION');
  expect(match.summary.errorCount).toBeGreaterThan(0);
  expect(match.lines.flatMap((line) => line.issues.map((issue) => issue.code))).toContain('INVOICE_QTY_GT_ORDERED');
  expect((await request('POST', `/api/invoices/${invoiceId}/approve`, a.identity, { idempotencyKey: randomUUID() })).status).toBe(409);
  expect(await db.journalEntry.count({ where: { tenantId: a.tenant.id, refId: invoiceId } })).toBe(0);
  expect(await db.accountEntry.count({ where: { tenantId: a.tenant.id, refId: invoiceId } })).toBe(0);
  expect((await stock(a)).toString()).toBe('1');
});

test('B: foreign supplier and unauthorized approval cannot create procurement side effects', async () => {
  const { a, b, limited } = await fixture();
  const input = { contactId: b.contact.id, date: '2026-11-01', items: [{ productId: a.product.id, quantity: 1, unitPrice: 40 }] };
  expect((await request('POST', '/api/purchase-orders', a.identity, input)).status).toBe(400);
  expect((await request('POST', '/api/purchase-orders/requests/missing/approve', limited)).status).toBe(403);
  expect(await db.purchaseOrder.count({ where: { tenantId: a.tenant.id } })).toBe(0);
  expect((await stock(a)).isZero()).toBe(true);
});
