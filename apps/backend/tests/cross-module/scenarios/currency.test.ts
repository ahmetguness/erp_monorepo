import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { expect, test } from 'vitest';
import { createPayment } from '../../../src/services/payment.service.js';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { create, data, entitySchema, request } from '../support/http.js';
import { addStock, stock, assertBalancedJournal, assertTenantBoundary } from '../support/invariants.js';

isolatedDatabase();

test('A: USD invoice and concurrent settlement reconcile document currency with rounded TRY accounting', async () => {
  const { a, b } = await fixture();
  const currency = { currencyCode: 'USD', exchangeRate: 35.123456 };
  await addStock(a, 10);
  const quoteId = await create('/api/sales-orders/quotes', a.identity, { ...currency, contactId: a.contact.id, date: '2026-11-01',
    items: [{ productId: a.product.id, quantity: 1, unitPrice: 100, discount: 10, taxRate: 20 }] });
  expect((await request('PATCH', `/api/sales-orders/quotes/${quoteId}/status`, a.identity, { status: 'SENT' })).status).toBe(200);
  const salesOrderId = data(await request('POST', `/api/sales-orders/quotes/${quoteId}/convert`, a.identity), 201, entitySchema).id;
  const order = await db.salesOrder.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: salesOrderId }, include: { items: true } });
  expect(order.currencyCode).toBe('USD');
  expect(order.exchangeRate.toString()).toBe('35.123456');
  const deliveryId = await create('/api/delivery-notes', a.identity, { salesOrderId, contactId: a.contact.id, warehouseId: a.warehouse.id,
    type: 'OUTBOUND', date: '2026-11-01', items: [{ productId: a.product.id, salesOrderItemId: order.items[0].id, orderedQty: 1, deliveredQty: 1 }] });
  expect((await request('PATCH', `/api/delivery-notes/${deliveryId}/status`, a.identity, { status: 'DELIVERED' })).status).toBe(200);
  const id = await create('/api/invoices', a.identity, { ...currency, salesOrderId, contactId: a.contact.id, type: 'SALES', date: '2026-11-01',
    lines: [{ productId: a.product.id, description: 'USD goods', quantity: 1, unitPrice: 100, discount: 10, taxRateId: a.tax.id }] });
  const approve = () => request('POST', `/api/invoices/${id}/approve`, a.identity, { idempotencyKey: `fx-posting-${id}` });
  expect((await Promise.all([approve(), approve()])).map((result) => result.status)).toEqual([200, 200]);
  const invoice = await db.invoice.findFirstOrThrow({ where: { tenantId: a.tenant.id, id } });
  expect(invoice.currencyCode).toBe('USD');
  expect(invoice.exchangeRate.toString()).toBe('35.123456');
  expect(invoice.totalGross.toString()).toBe('108');
  const debit = await db.accountEntry.findFirstOrThrow({ where: { tenantId: a.tenant.id, refId: id } });
  expect(debit.debit.toString()).toBe('3793.33');
  const cash = await db.cashAccount.create({ data: { tenantId: a.tenant.id, name: 'USD cash', currencyCode: 'USD' } });
  const payment = { ...currency, contactId: a.contact.id, cashAccountId: cash.id, direction: 'RECEIVE', method: 'CASH',
    amount: 108, date: '2026-11-01', idempotencyKey: randomUUID(), allocations: [{ invoiceId: id, amount: 108 }] };
  expect((await request('POST', '/api/payments', a.identity, { ...payment, cashAccountId: a.cash.id })).status).toBe(400);
  expect((await request('POST', '/api/payments', a.identity, { ...payment, exchangeRate: 36 })).status).toBe(400);
  const results = await Promise.all([request('POST', '/api/payments', a.identity, payment), request('POST', '/api/payments', a.identity, payment)]);
  const paymentId = data(results[0], 201, entitySchema).id;
  expect(data(results[1], 201, entitySchema).id).toBe(paymentId);
  const normalizedReplay = await createPayment({ tenantId: a.tenant.id,
    input: { ...payment, currencyCode: ' usd ', direction: 'RECEIVE', method: 'CASH' } }, db);
  expect(normalizedReplay.id).toBe(paymentId);
  expect(normalizedReplay.currencyCode).toBe('USD');
  expect((await request('POST', '/api/payments', a.identity, { ...payment, exchangeRate: 36 })).status).toBe(409);
  expect((await request('POST', '/api/accounting/posting-engine/run', a.identity, { source: 'PAYMENT', postImmediately: true })).status).toBe(200);
  await assertBalancedJournal(a.tenant.id, id);
  await assertBalancedJournal(a.tenant.id, paymentId);
  const journals = await db.journalEntry.findMany({ where: { tenantId: a.tenant.id, refId: { in: [id, paymentId] } }, include: { lines: true } });
  expect(journals).toHaveLength(2);
  for (const journal of journals) expect(journal.lines.reduce((sum, line) => sum.plus(line.debit), new Prisma.Decimal(0)).toString()).toBe('3793.33');
  const list = await request('GET', '/api/invoices', a.identity);
  expect(list.status).toBe(200);
  expect(z.object({ summary: z.object({ totalGross: z.number() }) }).parse(list.body).summary.totalGross).toBe(3793.33);
  const entries = await db.accountEntry.findMany({ where: { tenantId: a.tenant.id, contactId: a.contact.id } });
  expect(entries.reduce((sum, entry) => sum.plus(entry.debit).minus(entry.credit), new Prisma.Decimal(0)).isZero()).toBe(true);
  expect((await db.invoice.findFirstOrThrow({ where: { tenantId: a.tenant.id, id } })).status).toBe('PAID');
  expect(await db.payment.count({ where: { tenantId: a.tenant.id } })).toBe(1);
  expect((await stock(a)).toString()).toBe('9');
  await assertTenantBoundary(a, b, `/api/invoices/${id}`);
});
