import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { create, data, entitySchema, request } from '../support/http.js';
import { addStock, assertBalancedJournal, assertTenantBoundary, stock } from '../support/invariants.js';

isolatedDatabase();

test('A: quote → partial delivery → invoice → concurrent payment preserves stock and financial balances', async () => {
  const { a, b } = await fixture();
  await addStock(a, 10);
  const quoteId = await create('/api/sales-orders/quotes', a.identity, {
    contactId: a.contact.id, date: '2026-11-01',
    items: [{ productId: a.product.id, quantity: 2, unitPrice: 100 }],
  });
  expect((await request('PATCH', `/api/sales-orders/quotes/${quoteId}/status`, a.identity, { status: 'SENT' })).status).toBe(200);
  const orderId = data(await request('POST', `/api/sales-orders/quotes/${quoteId}/convert`, a.identity), 201, entitySchema).id;
  const item = await db.salesOrderItem.findFirstOrThrow({ where: { tenantId: a.tenant.id, orderId } });
  const deliveryId = await create('/api/delivery-notes', a.identity, {
    type: 'OUTBOUND', salesOrderId: orderId, contactId: a.contact.id, warehouseId: a.warehouse.id, date: '2026-11-01',
    items: [{ productId: a.product.id, orderedQty: 2, deliveredQty: 1, salesOrderItemId: item.id }],
  });
  expect((await request('PATCH', `/api/delivery-notes/${deliveryId}/status`, a.identity, { status: 'DELIVERED' })).status).toBe(200);
  expect((await stock(a)).toString()).toBe('9');
  const invoiceId = await create('/api/invoices', a.identity, {
    contactId: a.contact.id, salesOrderId: orderId, type: 'SALES', date: '2026-11-01',
    lines: [{ productId: a.product.id, description: 'Partial delivery', quantity: 1, unitPrice: 100, discount: 10, taxRateId: a.tax.id }],
  });
  const approve = () => request('POST', `/api/invoices/${invoiceId}/approve`, a.identity, { idempotencyKey: `posting-${invoiceId}` });
  expect((await Promise.all([approve(), approve()])).map((result) => result.status)).toEqual([200, 200]);
  const invoice = await db.invoice.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: invoiceId } });
  expect(invoice.totalGross.toString()).toBe('108');
  const payment = { contactId: a.contact.id, cashAccountId: a.cash.id, date: '2026-11-01', amount: 108,
    direction: 'RECEIVE', method: 'CASH', idempotencyKey: randomUUID(), allocations: [{ invoiceId, amount: 108 }] };
  const receipts = await Promise.all([request('POST', '/api/payments', a.identity, payment), request('POST', '/api/payments', a.identity, payment)]);
  const ids = receipts.map((result) => data(result, 201, entitySchema).id);
  expect(ids[0]).toBe(ids[1]);
  expect(await db.paymentAllocation.count({ where: { tenantId: a.tenant.id, invoiceId } })).toBe(1);
  await assertBalancedJournal(a.tenant.id, invoiceId);
  const balance = await db.accountEntry.aggregate({ where: { tenantId: a.tenant.id, contactId: a.contact.id }, _sum: { debit: true, credit: true } });
  expect(balance._sum.debit?.equals(balance._sum.credit ?? 0)).toBe(true);
  await assertTenantBoundary(a, b, `/api/invoices/${invoiceId}`);
  expect((await request('POST', '/api/payments', a.identity, { ...payment, idempotencyKey: randomUUID(), amount: 1, allocations: [{ invoiceId, amount: 1 }] })).status).toBe(400);
  expect(await db.payment.count({ where: { tenantId: a.tenant.id } })).toBe(1);
});

test('A: fractional discounted VAT amounts reconcile and invalid FX is rejected', async () => {
  const { a } = await fixture();
  const input = { contactId: a.contact.id, type: 'SALES', date: '2026-11-01',
    lines: [{ productId: a.product.id, description: 'Fractional price', quantity: 3, unitPrice: 0.1, discount: 10, taxRateId: a.tax.id }] };
  expect((await request('POST', '/api/invoices', a.identity, { ...input, currencyCode: 'USD', exchangeRate: 0 })).status).toBe(400);
  expect(await db.invoice.count({ where: { tenantId: a.tenant.id } })).toBe(0);
  const id = await create('/api/invoices', a.identity, input);
  const invoice = await db.invoice.findFirstOrThrow({ where: { tenantId: a.tenant.id, id } });
  expect(invoice.totalGross.toString()).toBe('0.32');
  expect((await request('POST', `/api/invoices/${id}/approve`, a.identity, { idempotencyKey: randomUUID() })).status).toBe(200);
  await assertBalancedJournal(a.tenant.id, id);
});

test('A: competing sales reservations cannot allocate the same available stock twice', async () => {
  const { a } = await fixture();
  await addStock(a, 5);
  const orders = await Promise.all([1, 2].map(() => create('/api/sales-orders', a.identity, { contactId: a.contact.id, date: '2026-11-01', items: [{ productId: a.product.id, quantity: 4, unitPrice: 100 }] })));
  const results = await Promise.all(orders.map((orderId) => request('POST', '/api/inventory-reservations/from-sales-order', a.identity, { orderId, warehouseId: a.warehouse.id, allowPartial: false })));
  expect(results.filter((result) => result.status >= 200 && result.status < 300)).toHaveLength(1);
  expect(results.filter((result) => result.status >= 400 && result.status < 500)).toHaveLength(1);
  const sum = await db.inventoryReservation.aggregate({ where: { tenantId: a.tenant.id, releasedAt: null }, _sum: { quantity: true } });
  expect(sum._sum.quantity?.toString()).toBe('4');
  expect((await stock(a)).toString()).toBe('5');
});

test('A: invalid foreign product rolls back the entire invoice and financial side effects', async () => {
  const { a, b, limited } = await fixture();
  const input = { contactId: a.contact.id, type: 'SALES', date: '2026-11-01', lines: [
    { productId: a.product.id, description: 'Valid', quantity: 1, unitPrice: 100 },
    { productId: b.product.id, description: 'Foreign', quantity: 1, unitPrice: 100 },
  ] };
  expect((await request('POST', '/api/invoices', limited, input)).status).toBe(403);
  expect((await request('POST', '/api/invoices', a.identity, input)).status).toBe(400);
  expect(await db.invoice.count({ where: { tenantId: a.tenant.id } })).toBe(0);
  expect(await db.accountEntry.count({ where: { tenantId: a.tenant.id } })).toBe(0);
  expect(await db.journalEntry.count({ where: { tenantId: a.tenant.id } })).toBe(0);
});

test('A: cancellation reverses posting exactly once and preserves balanced journals', async () => {
  const { a } = await fixture();
  const id = await create('/api/invoices', a.identity, { contactId: a.contact.id, type: 'SALES', date: '2026-11-01',
    lines: [{ productId: a.product.id, description: 'Cancellation', quantity: 1, unitPrice: 100 }] });
  expect((await request('POST', `/api/invoices/${id}/approve`, a.identity, { idempotencyKey: randomUUID() })).status).toBe(200);
  expect((await request('POST', `/api/invoices/${id}/cancel`, a.identity)).status).toBe(200);
  expect((await request('POST', `/api/invoices/${id}/cancel`, a.identity)).status).toBe(400);
  const sum = await db.accountEntry.aggregate({ where: { tenantId: a.tenant.id, refId: id }, _sum: { debit: true, credit: true } });
  expect(sum._sum.debit?.equals(sum._sum.credit ?? 0)).toBe(true);
  await assertBalancedJournal(a.tenant.id, id);
});
