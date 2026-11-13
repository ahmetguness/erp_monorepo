import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { expect, test } from 'vitest';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { create, data, entitySchema, request } from '../support/http.js';
import { serializableTransaction } from '../../../src/lib/serializable-transaction.js';
import { ProductionAutomationService } from '../../../src/modules/production/infrastructure/services/production-automation.service.js';
import { recomputeInvoiceStatus } from '../../../src/services/financial/invoice-status.service.js';

isolatedDatabase();

test('mutation contract: invalid production output cannot silently fall back to the planned quantity', async () => {
  const { a } = await fixture();
  const id = await create('/api/production/work-orders', a.identity, { productId: a.product.id, plannedQty: 2, outputWarehouseId: a.warehouse.id });
  const before = await db.workOrder.findFirstOrThrow({ where: { tenantId: a.tenant.id, id } });
  const historyBefore = await db.workOrderHistory.count({ where: { tenantId: a.tenant.id, workOrderId: id } });
  const service = new ProductionAutomationService(db);
  for (const quantity of [NaN, Infinity, -Infinity, 0, -1]) {
    await expect(service.autoCompleteProduction(a.tenant.id, id, quantity)).rejects.toThrow('quantity must be positive');
    const after = await db.workOrder.findFirstOrThrow({ where: { tenantId: a.tenant.id, id } });
    expect(after.status).toBe(before.status);
    expect(after.producedQty.equals(before.producedQty)).toBe(true);
  }
  expect(await db.stockMovement.count({ where: { tenantId: a.tenant.id, refId: id } })).toBe(0);
  expect(await db.workOrderHistory.count({ where: { tenantId: a.tenant.id, workOrderId: id } })).toBe(historyBefore);
  await service.autoCompleteProduction(a.tenant.id, id);
  const completed = await db.workOrder.findFirstOrThrow({ where: { tenantId: a.tenant.id, id } });
  expect(completed.status).toBe('COMPLETED');
  expect(completed.producedQty.toString()).toBe('2');
  expect(await db.stockMovement.count({ where: { tenantId: a.tenant.id, refId: id, type: 'IN' } })).toBe(1);
  const balance = await db.stockLevel.aggregate({ where: { tenantId: a.tenant.id, productId: a.product.id, warehouseId: a.warehouse.id }, _sum: { quantity: true } });
  expect(balance._sum.quantity?.toString()).toBe('2');
});

test.each([
  { code: 'P2034', expectedAttempts: 3, message: 'Concurrent modification' },
  { code: 'P2002', expectedAttempts: 1, message: 'Injected permanent failure' },
])('mutation contract: $code has bounded attempts and leaves no partial write', async ({ code, expectedAttempts, message }) => {
  const { a } = await fixture();
  let attempts = 0;
  await expect(serializableTransaction(db, async (tx) => {
    attempts += 1;
    await tx.tenant.update({ where: { id: a.tenant.id }, data: { notes: 'Must roll back' } });
    throw new Prisma.PrismaClientKnownRequestError('Injected permanent failure', { code, clientVersion: Prisma.prismaVersion.client });
  })).rejects.toThrow(message);
  expect(attempts).toBe(expectedAttempts);
  expect((await db.tenant.findUniqueOrThrow({ where: { id: a.tenant.id } })).notes).toBe(a.tenant.notes);
});

test('mutation contract: concurrent invoices cannot exceed the sales order amount', async () => {
  const { a } = await fixture();
  const orderId = await create('/api/sales-orders', a.identity, { contactId: a.contact.id, date: '2026-11-01', items: [{ productId: a.product.id, quantity: 1, unitPrice: 100 }] });
  const invoice = () => request('POST', '/api/invoices', a.identity, { contactId: a.contact.id, salesOrderId: orderId, type: 'SALES', date: '2026-11-01',
    lines: [{ productId: a.product.id, description: 'Concurrent invoice', quantity: 1, unitPrice: 100 }] });
  const results = await Promise.all([invoice(), invoice()]);
  expect(results.filter((result) => result.status === 201)).toHaveLength(1);
  expect(results.filter((result) => result.status === 400)).toHaveLength(1);
  expect(await db.invoice.count({ where: { tenantId: a.tenant.id, salesOrderId: orderId } })).toBe(1);
  expect((await db.salesOrder.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: orderId } })).invoicedAmount.toString()).toBe('100');
});

test('mutation contract: serialization conflict retries without a lost update', async () => {
  const { a } = await fixture();
  const initial = a.tenant.maxUsers ?? 0;
  let release: () => void = () => undefined;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  let arrivals = 0;
  let attempts = 0;
  const increment = () => serializableTransaction(db, async (tx) => {
    attempts += 1;
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: a.tenant.id } });
    arrivals += 1;
    if (arrivals <= 2) {
      if (arrivals === 2) release();
      await barrier;
    }
    await tx.tenant.update({ where: { id: a.tenant.id }, data: { maxUsers: (tenant.maxUsers ?? 0) + 1 } });
  });
  await Promise.all([increment(), increment()]);
  expect(attempts).toBeGreaterThanOrEqual(3);
  expect((await db.tenant.findUniqueOrThrow({ where: { id: a.tenant.id } })).maxUsers).toBe(initial + 2);
});

test('mutation contract: tenant administrator cannot mutate a shared global identity', async () => {
  const { a, b } = await fixture();
  await db.tenantUser.create({ data: { tenantId: b.tenant.id, userId: a.owner.id, isActive: true } });
  const result = await request('PATCH', `/api/users/${a.owner.id}`, a.identity, { name: 'Cross-tenant overwrite' });
  expect(result.status).toBe(400);
  expect((await db.user.findUniqueOrThrow({ where: { id: a.owner.id } })).name).toBe(a.owner.name);
  expect(await db.tenantUser.count({ where: { userId: a.owner.id, isActive: true } })).toBe(2);
});

async function financialFixture() {
  const { a } = await fixture();
  const invoiceId = await create('/api/invoices', a.identity, { contactId: a.contact.id, type: 'SALES', date: '2026-11-01',
    lines: [{ productId: a.product.id, description: 'Mutation contract', quantity: 1, unitPrice: 100 }] });
  expect((await request('POST', `/api/invoices/${invoiceId}/approve`, a.identity, { idempotencyKey: randomUUID() })).status).toBe(200);
  const payment = { contactId: a.contact.id, cashAccountId: a.cash.id, date: '2026-11-01', amount: 100,
    direction: 'RECEIVE', method: 'CASH', idempotencyKey: randomUUID(), allocations: [{ invoiceId, amount: 100 }] };
  return { a, invoiceId, payment };
}

test('mutation contract: cancellation and allocation cannot both commit', async () => {
  const { a, invoiceId, payment } = await financialFixture();
  const results = await Promise.all([
    request('POST', `/api/invoices/${invoiceId}/cancel`, a.identity, { reason: 'Race regression' }),
    request('POST', '/api/payments', a.identity, payment),
  ]);
  expect(results.filter((result) => result.status < 300)).toHaveLength(1);
  const invoice = await db.invoice.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: invoiceId } });
  const allocations = await db.paymentAllocation.count({ where: { tenantId: a.tenant.id, invoiceId } });
  expect(allocations).toBe(invoice.status === 'CANCELLED' ? 0 : 1);
});

test('mutation contract: concurrent cancellation produces one reversal, history and audit', async () => {
  const { a, invoiceId } = await financialFixture();
  const auditsBefore = await db.auditLog.count({ where: { tenantId: a.tenant.id, entityId: invoiceId, action: 'UPDATE', module: 'invoicing' } });
  const cancel = () => request('POST', `/api/invoices/${invoiceId}/cancel`, a.identity, { reason: 'Concurrent cancel' });
  const scan = recomputeInvoiceStatus(db, a.tenant.id, invoiceId, { asOf: new Date('2099-01-01') });
  const results = await Promise.all([cancel(), cancel()]);
  await scan;
  expect(results.filter((result) => result.status === 200)).toHaveLength(1);
  expect((await db.invoice.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: invoiceId } })).status).toBe('CANCELLED');
  expect(await db.invoiceHistory.count({ where: { tenantId: a.tenant.id, invoiceId, toStatus: 'CANCELLED' } })).toBe(1);
  expect(await db.auditLog.count({ where: { tenantId: a.tenant.id, entityId: invoiceId, action: 'UPDATE', module: 'invoicing' } })).toBe(auditsBefore + 1);
  const entries = await db.accountEntry.findMany({ where: { tenantId: a.tenant.id, contactId: a.contact.id } });
  expect(entries.reduce((sum, row) => sum + Number(row.debit) - Number(row.credit), 0)).toBe(0);
});

test('mutation contract: competing reversals leave no allocation and one cancellation audit', async () => {
  const { a, invoiceId, payment } = await financialFixture();
  const paymentId = data(await request('POST', '/api/payments', a.identity, payment), 201, entitySchema).id;
  const reverse = () => request('POST', `/api/payments/${paymentId}/cancel`, a.identity, { reason: 'Reverse regression' });
  const results = await Promise.all([reverse(), reverse()]);
  expect(results.filter((result) => result.status === 200)).toHaveLength(1);
  expect(await db.paymentAllocation.count({ where: { tenantId: a.tenant.id, invoiceId } })).toBe(0);
  expect((await db.invoice.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: invoiceId } })).status).not.toBe('PAID');
  expect(await db.auditLog.count({ where: { tenantId: a.tenant.id, entityId: paymentId, action: 'UPDATE' } })).toBe(1);
});

test('mutation contract: reversal audit failure preserves completed payment and invoice balance', async () => {
  const { a, invoiceId, payment } = await financialFixture();
  const paymentId = data(await request('POST', '/api/payments', a.identity, payment), 201, entitySchema).id;
  const entriesBefore = await db.accountEntry.count({ where: { tenantId: a.tenant.id } });
  const auditBefore = await db.auditLog.count({ where: { tenantId: a.tenant.id, entityId: paymentId, action: 'UPDATE' } });
  const reverse = () => request('POST', `/api/payments/${paymentId}/cancel`, a.identity, { reason: 'Audit rollback regression' });
  await db.$executeRawUnsafe(`CREATE FUNCTION phase4_reject_reversal_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'phase4 reversal audit failure'; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER phase4_reversal_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION phase4_reject_reversal_audit()`);
  try {
    expect((await reverse()).status).toBe(500);
    expect((await db.payment.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: paymentId } })).status).toBe('COMPLETED');
    expect((await db.invoice.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: invoiceId } })).status).toBe('PAID');
    expect(await db.paymentAllocation.count({ where: { tenantId: a.tenant.id, paymentId, invoiceId } })).toBe(1);
    expect(await db.accountEntry.count({ where: { tenantId: a.tenant.id } })).toBe(entriesBefore);
    expect(await db.auditLog.count({ where: { tenantId: a.tenant.id, entityId: paymentId, action: 'UPDATE' } })).toBe(auditBefore);
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER phase4_reversal_audit_failure ON audit_logs');
    await db.$executeRawUnsafe('DROP FUNCTION phase4_reject_reversal_audit()');
  }
  expect((await reverse()).status).toBe(200);
});

test.each(['audit_logs', 'domain_event_outbox'] as const)('mutation contract: %s failure rolls back payment, allocation, account entry and event', async (table) => {
  const { a, invoiceId, payment } = await financialFixture();
  await db.$executeRawUnsafe(`CREATE FUNCTION phase4_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'phase4 injected audit failure'; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER phase4_audit_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION phase4_reject_audit()`);
  try {
    expect((await request('POST', '/api/payments', a.identity, payment)).status).toBe(500);
    expect(await db.payment.count({ where: { tenantId: a.tenant.id } })).toBe(0);
    expect(await db.paymentAllocation.count({ where: { tenantId: a.tenant.id, invoiceId } })).toBe(0);
    expect(await db.accountEntry.count({ where: { tenantId: a.tenant.id, refType: 'PAYMENT' } })).toBe(0);
    expect(await db.domainEventOutbox.count({ where: { tenantId: a.tenant.id, name: 'payment.received' } })).toBe(0);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER phase4_audit_failure ON ${table}`);
    await db.$executeRawUnsafe('DROP FUNCTION phase4_reject_audit()');
  }
  expect((await request('POST', '/api/payments', a.identity, payment)).status).toBe(201);
  expect(await db.domainEventOutbox.count({ where: { tenantId: a.tenant.id, name: 'payment.received' } })).toBe(1);
});

test('mutation contract: cancelled production cannot be revived by automatic completion', async () => {
  const { a } = await fixture();
  const id = await create('/api/production/work-orders', a.identity, { productId: a.product.id, plannedQty: 2, outputWarehouseId: a.warehouse.id });
  expect((await request('POST', `/api/production/work-orders/${id}/status`, a.identity, { status: 'CANCELLED' })).status).toBe(200);
  await expect(new ProductionAutomationService(db).autoCompleteProduction(a.tenant.id, id)).rejects.toThrow('Cancelled');
  expect((await db.workOrder.findFirstOrThrow({ where: { tenantId: a.tenant.id, id } })).status).toBe('CANCELLED');
  expect(await db.stockMovement.count({ where: { tenantId: a.tenant.id, refId: id } })).toBe(0);
});
