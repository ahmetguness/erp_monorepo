import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const runId = Date.now();
const prefix = `TEST_E2E_QUOTE_${runId}`;

type Session = { cookie: string; tenantId: string; permissions: Array<{ module: string; action: string }> };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'demo1234', tenantSlug }),
  });
  assert.equal(response.status, 200, `login ${email}`);
  const json = await response.json() as any;
  return { cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', tenantId: json.data.tenant.id, permissions: json.data.user.tenantMembership?.role?.permissions ?? [] };
}

async function api(session: Session | null, method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function main() {
  const owner = await login('admin@axondemo.com', 'axon-demo');
  const tenantB = await login('starter@axondemo.com', 'axon-starter-demo');
  const sales = await login('satis@axondemo.com', 'axon-demo');
  const accounting = await login('muhasebe@axondemo.com', 'axon-demo');
  let contactId: string | null = null;
  const productIds: string[] = [];

  try {
    assert.equal((await api(null, 'GET', '/api/sales-orders/quotes')).status, 401);

    const contact = await api(owner, 'POST', '/api/contacts', { type: 'CUSTOMER', name: `${prefix}_CUSTOMER`, code: `${prefix}_CUSTOMER` });
    assert.equal(contact.status, 201);
    contactId = contact.body.data.id;
    const [unit, location] = await Promise.all([
      prisma.unit.findFirstOrThrow({ where: { tenantId: owner.tenantId } }),
      prisma.location.findFirstOrThrow({ where: { tenantId: owner.tenantId, isActive: true, warehouse: { isActive: true } }, include: { warehouse: true } }),
    ]);
    for (let index = 1; index <= 2; index += 1) {
      const product = await prisma.product.create({ data: { tenantId: owner.tenantId, unitId: unit.id, code: `${prefix}_PRODUCT_${index}`, name: `${prefix}_PRODUCT_${index}`, salesPrice: index === 1 ? 1000 : 500 } });
      productIds.push(product.id);
      await prisma.stockLevel.create({ data: { tenantId: owner.tenantId, productId: product.id, warehouseId: location.warehouseId, locationId: location.id, quantity: 10 } });
    }

    const date = new Date();
    const validUntil = new Date(date.getTime() + 10 * 86_400_000);
    const validPayload = {
      contactId, number: `${prefix}_MAIN`, date: date.toISOString(), validUntil: validUntil.toISOString(), notes: 'Türkçe: İzmir ölçüm',
      items: [
        { productId: productIds[0], description: 'Kalem ÇĞİÖŞÜ', quantity: 2, unitPrice: 1000, discount: 10, taxRate: 20 },
        { productId: productIds[1], description: 'İkinci kalem', quantity: 3, unitPrice: 500, discount: 0, taxRate: 10 },
      ],
    };

    const invalidCases: Array<[string, any]> = [
      ['empty-body', {}],
      ['whitespace-contact', { ...validPayload, contactId: '   ' }],
      ['no-items', { ...validPayload, items: [] }],
      ['negative-quantity', { ...validPayload, items: [{ ...validPayload.items[0], quantity: -1 }] }],
      ['zero-quantity', { ...validPayload, items: [{ ...validPayload.items[0], quantity: 0 }] }],
      ['negative-price', { ...validPayload, items: [{ ...validPayload.items[0], unitPrice: -1 }] }],
      ['discount-over-100', { ...validPayload, items: [{ ...validPayload.items[0], discount: 101 }] }],
      ['tax-over-100', { ...validPayload, items: [{ ...validPayload.items[0], taxRate: 101 }] }],
      ['invalid-date', { ...validPayload, date: 'not-a-date' }],
      ['valid-until-before-date', { ...validPayload, validUntil: new Date(date.getTime() - 86_400_000).toISOString() }],
      ['huge-number', { ...validPayload, items: [{ ...validPayload.items[0], unitPrice: 1e30 }] }],
      ['unknown-field', { ...validPayload, unexpected: true }],
      ['too-long-notes', { ...validPayload, notes: 'X'.repeat(2001) }],
    ];
    for (const [label, payload] of invalidCases) {
      const result = await api(owner, 'POST', '/api/sales-orders/quotes', payload);
      assert.equal(result.status, 400, `${label}: ${JSON.stringify(result.body)}`);
      assert.equal(result.body.error.code, 'VALIDATION_ERROR', label);
    }

    const tenantBContact = await prisma.contact.findFirstOrThrow({ where: { tenantId: tenantB.tenantId, deletedAt: null } });
    const tenantBProduct = await prisma.product.findFirstOrThrow({ where: { tenantId: tenantB.tenantId, deletedAt: null } });
    assert.equal((await api(owner, 'POST', '/api/sales-orders/quotes', { ...validPayload, contactId: tenantBContact.id, number: `${prefix}_CROSS_CONTACT` })).status, 400);
    assert.equal((await api(owner, 'POST', '/api/sales-orders/quotes', { ...validPayload, number: `${prefix}_CROSS_PRODUCT`, items: [{ ...validPayload.items[0], productId: tenantBProduct.id }] })).status, 400);

    const created = await api(owner, 'POST', '/api/sales-orders/quotes', validPayload);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const quoteId = created.body.data.id as string;
    assert.equal(Number(created.body.data.totalNet), 3300);
    assert.equal(Number(created.body.data.totalTax), 510);
    assert.equal(Number(created.body.data.totalGross), 3810);
    const stored = await prisma.salesQuote.findUniqueOrThrow({ where: { id: quoteId }, include: { items: true } });
    assert.equal(stored.tenantId, owner.tenantId);
    assert.equal(stored.contactId, contactId);
    assert.equal(stored.items.length, 2);
    assert.equal(Number(stored.totalGross), 3810);
    assert.equal(stored.notes, 'Türkçe: İzmir ölçüm');

    const updatePayload: any = {
      contactId, date: date.toISOString(), validUntil: validUntil.toISOString(), notes: 'TEST_E2E_UPDATED Türkçe not',
      items: [
        { ...validPayload.items[0], quantity: 1, unitPrice: 2000 },
        validPayload.items[1],
      ],
    };
    const updated = await api(owner, 'PATCH', `/api/sales-orders/quotes/${quoteId}`, updatePayload);
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.data.notes, 'TEST_E2E_UPDATED Türkçe not');
    assert.equal(Number(updated.body.data.totalGross), 3810);
    const updatedDb = await prisma.salesQuote.findUniqueOrThrow({ where: { id: quoteId }, include: { items: true } });
    assert.equal(updatedDb.items.length, 2);
    assert.equal(Number(updatedDb.items[0].quantity), 1);
    assert.equal((await api(owner, 'GET', `/api/sales-orders/quotes/${quoteId}`)).body.data.notes, 'TEST_E2E_UPDATED Türkçe not');
    assert.equal((await api(tenantB, 'PATCH', `/api/sales-orders/quotes/${quoteId}`, updatePayload)).status, 404);
    assert.equal((await api(tenantB, 'DELETE', `/api/sales-orders/quotes/${quoteId}`)).status, 404);
    assert.ok(accounting.permissions.some((permission) => permission.module === 'invoicing' && permission.action === 'UPDATE'));
    assert.equal((await api(accounting, 'PATCH', `/api/sales-orders/quotes/${quoteId}`, updatePayload)).status, 200);
    assert.equal((await api(null, 'PATCH', `/api/sales-orders/quotes/${quoteId}`, updatePayload)).status, 401);

    const duplicate = await api(owner, 'POST', '/api/sales-orders/quotes', validPayload);
    assert.equal(duplicate.status, 409);
    assert.equal(await prisma.salesQuote.count({ where: { tenantId: owner.tenantId, number: validPayload.number } }), 1);

    assert.equal((await api(owner, 'GET', `/api/sales-orders/quotes/${quoteId}`)).status, 200);
    assert.equal((await api(owner, 'GET', '/api/sales-orders/quotes/does-not-exist')).status, 404);
    for (const method of ['GET', 'POST'] as const) {
      const result = await api(tenantB, method, `/api/sales-orders/quotes/${quoteId}${method === 'POST' ? '/convert' : ''}`);
      assert.equal(result.status, 404, `tenant isolation ${method}`);
    }

    const lifecycleCreated = await api(owner, 'POST', '/api/sales-orders/quotes', { ...validPayload, number: `${prefix}_LIFECYCLE` });
    const lifecycleId = lifecycleCreated.body.data.id as string;
    assert.equal((await api(owner, 'PATCH', `/api/sales-orders/quotes/${lifecycleId}/status`, { status: 'SENT' })).status, 200);
    assert.equal((await api(owner, 'PATCH', `/api/sales-orders/quotes/${lifecycleId}`, updatePayload)).status, 400);
    assert.equal((await api(owner, 'PATCH', `/api/sales-orders/quotes/${lifecycleId}/status`, { status: 'REJECTED' })).status, 200);
    assert.equal((await api(owner, 'PATCH', `/api/sales-orders/quotes/${lifecycleId}/status`, { status: 'SENT' })).status, 400);

    const deletedCreated = await api(owner, 'POST', '/api/sales-orders/quotes', { ...validPayload, number: `${prefix}_DELETE` });
    const deletedId = deletedCreated.body.data.id as string;
    assert.equal((await api(owner, 'DELETE', `/api/sales-orders/quotes/${deletedId}`)).status, 204);
    assert.equal((await api(owner, 'GET', `/api/sales-orders/quotes/${deletedId}`)).status, 404);
    assert.ok((await prisma.salesQuote.findUniqueOrThrow({ where: { id: deletedId } })).deletedAt);

    assert.ok(sales.permissions.some((permission) => permission.module === 'invoicing' && permission.action === 'CREATE'));
    assert.ok(accounting.permissions.some((permission) => permission.module === 'invoicing' && permission.action === 'READ'));
    assert.equal((await api(accounting, 'POST', '/api/sales-orders/quotes', { ...validPayload, number: `${prefix}_ACCOUNTING_FORBIDDEN` })).status, 403);
    const salesQuote = await api(sales, 'POST', '/api/sales-orders/quotes', { ...validPayload, number: `${prefix}_SALES_ROLE` });
    assert.equal(salesQuote.status, 201);
    await prisma.salesQuote.update({ where: { id: salesQuote.body.data.id }, data: { status: 'SENT' } });
    assert.equal((await api(sales, 'POST', `/api/sales-orders/quotes/${salesQuote.body.data.id}/convert`)).status, 201);

    // Pagination, search, status and date filters with more than one page.
    await prisma.salesQuote.createMany({ data: Array.from({ length: 23 }, (_, index) => ({
      tenantId: owner.tenantId, contactId: contactId!, number: `${prefix}_PAGE_${String(index).padStart(2, '0')}`,
      date: new Date(date.getTime() - index * 86_400_000),
      validUntil: index % 2 === 0 ? validUntil : new Date(date.getTime() + 5 * 86_400_000),
      status: index % 2 === 0 ? 'DRAFT' : 'SENT', totalGross: 100,
    })) });
    const page1 = await api(owner, 'GET', `/api/sales-orders/quotes?search=${prefix}_PAGE&page=1&limit=10`);
    const page3 = await api(owner, 'GET', `/api/sales-orders/quotes?search=${prefix}_PAGE&page=3&limit=10`);
    assert.equal(page1.body.meta.total, 23);
    assert.equal(page1.body.meta.totalPages, 3);
    assert.equal(page1.body.data.length, 10);
    assert.equal(page3.body.data.length, 3);
    assert.deepEqual(page1.body.summary, { total: 23, sentCount: 11, attentionCount: 11, totalGross: 2300 });
    assert.deepEqual(page3.body.summary, page1.body.summary);
    const sent = await api(owner, 'GET', `/api/sales-orders/quotes?search=${prefix}_PAGE&status=SENT&page=1&limit=50`);
    assert.equal(sent.body.meta.total, 11);
    assert.ok(sent.body.data.every((row: any) => row.status === 'SENT'));
    const contactFilter = await api(owner, 'GET', `/api/sales-orders/quotes?contactId=${contactId}&page=1&limit=100`);
    assert.equal(contactFilter.body.meta.total, 26);
    const empty = await api(owner, 'GET', `/api/sales-orders/quotes?search=${prefix}_NO_MATCH`);
    assert.equal(empty.body.meta.total, 0);
    assert.deepEqual(empty.body.data, []);

    // Authorization from seeded permission sets.
    assert.equal((await api(sales, 'GET', `/api/sales-orders/quotes/${quoteId}`)).status, 200);
    assert.equal((await api(accounting, 'GET', `/api/sales-orders/quotes/${quoteId}`)).status, 200);

    // Concurrent double conversion must create one and only one order.
    const conversions = await Promise.all([
      api(owner, 'POST', `/api/sales-orders/quotes/${quoteId}/convert`),
      api(owner, 'POST', `/api/sales-orders/quotes/${quoteId}/convert`),
    ]);
    assert.equal(conversions.filter((result) => result.status === 201).length, 1);
    assert.equal(conversions.filter((result) => result.status !== 201).length, 1);
    const converted = conversions.find((result) => result.status === 201)!;
    const orderId = converted.body.data.id as string;
    assert.equal(await prisma.salesOrder.count({ where: { tenantId: owner.tenantId, quoteId } }), 1);
    const accepted = await prisma.salesQuote.findUniqueOrThrow({ where: { id: quoteId } });
    assert.equal(accepted.status, 'ACCEPTED');
    assert.equal((await api(owner, 'PATCH', `/api/sales-orders/quotes/${quoteId}`, updatePayload)).status, 400);
    assert.equal((await api(owner, 'DELETE', `/api/sales-orders/quotes/${quoteId}`)).status, 400);
    const order = await prisma.salesOrder.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    assert.equal(Number(order.totalGross), 3810);
    assert.equal(order.items.length, 2);

    const fulfilled = await api(owner, 'POST', `/api/sales-orders/${orderId}/fulfill`, { warehouseId: location.warehouseId, createDeliveryDraft: true, createInvoiceDraft: true });
    assert.equal(fulfilled.status, 200, JSON.stringify(fulfilled.body));
    const deliveryId = fulfilled.body.data.deliveryNoteId as string;
    const invoiceId = fulfilled.body.data.invoiceId as string;
    assert.equal((await api(owner, 'PATCH', `/api/delivery-notes/${deliveryId}/status`, { status: 'DELIVERED' })).status, 200);
    assert.equal((await api(owner, 'POST', `/api/invoices/${invoiceId}/approve`, { idempotencyKey: `${prefix}_APPROVE` })).status, 200);
    const payment = await api(owner, 'POST', '/api/payments', {
      contactId, date: date.toISOString(), amount: 1000, method: 'BANK_TRANSFER', direction: 'RECEIVE',
      reference: prefix, idempotencyKey: `${prefix}_PAYMENT`, allocations: [{ invoiceId, amount: 1000 }],
    });
    assert.equal(payment.status, 201, JSON.stringify(payment.body));
    const contactDetail = await api(owner, 'GET', `/api/contacts/${contactId}`);
    assert.equal(contactDetail.body.data.financials.totalDebit, 3810);
    assert.equal(contactDetail.body.data.financials.totalCredit, 1000);
    assert.equal(contactDetail.body.data.financials.currentBalance, 2810);
    const dbBalance = (await prisma.accountEntry.findMany({ where: { tenantId: owner.tenantId, contactId: contactId! } }))
      .reduce((sum, entry) => sum + Number(entry.debit) - Number(entry.credit), 0);
    assert.equal(dbBalance, 2810);
    const workspace = await api(owner, 'GET', `/api/sales-orders/${orderId}/process-workspace`);
    assert.equal(workspace.status, 200);
    assert.ok(workspace.body.data.timeline.some((event: any) => event.kind === 'QUOTE'));
    assert.ok(workspace.body.data.timeline.some((event: any) => event.kind === 'INVOICE'));
    assert.ok(workspace.body.data.timeline.some((event: any) => event.kind === 'PAYMENT'));

    console.log(JSON.stringify({ status: 'PASS', prefix, validations: invalidCases.map(([label]) => label), pagination: { total: 23, pages: 3 }, tenantIsolation: ['GET', 'CONVERT'], calculations: { totalNet: 3300, totalTax: 510, totalGross: 3810 }, flow: { quoteId, orderId, deliveryId, invoiceId, paymentId: payment.body.data.id, expectedBalance: 2810, actualBalance: dbBalance } }, null, 2));
  } finally {
    if (contactId) {
      const quoteIds = (await prisma.salesQuote.findMany({ where: { contactId }, select: { id: true } })).map((row) => row.id);
      const orderIds = (await prisma.salesOrder.findMany({ where: { contactId }, select: { id: true } })).map((row) => row.id);
      const deliveryIds = (await prisma.deliveryNote.findMany({ where: { contactId }, select: { id: true } })).map((row) => row.id);
      const invoiceIds = (await prisma.invoice.findMany({ where: { contactId }, select: { id: true } })).map((row) => row.id);
      const paymentIds = (await prisma.payment.findMany({ where: { contactId }, select: { id: true } })).map((row) => row.id);
      await prisma.$transaction(async (tx) => {
        if (invoiceIds.length) {
          await tx.paymentAllocation.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
          await tx.invoiceHistory.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
          await tx.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        }
        await tx.accountEntry.deleteMany({ where: { contactId: contactId! } });
        if (paymentIds.length) await tx.payment.deleteMany({ where: { id: { in: paymentIds } } });
        if (invoiceIds.length) await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
        if (deliveryIds.length) {
          const movementIds = (await tx.stockMovement.findMany({ where: { refType: 'DELIVERY_NOTE', refId: { in: deliveryIds } }, select: { id: true } })).map((row) => row.id);
          if (movementIds.length) await tx.stockValuation.deleteMany({ where: { movementId: { in: movementIds } } });
          await tx.stockMovement.deleteMany({ where: { refType: 'DELIVERY_NOTE', refId: { in: deliveryIds } } });
          await tx.deliveryNoteItem.deleteMany({ where: { deliveryNoteId: { in: deliveryIds } } });
          await tx.deliveryNote.deleteMany({ where: { id: { in: deliveryIds } } });
        }
        if (orderIds.length) {
          await tx.inventoryReservation.deleteMany({ where: { refType: 'SALES_ORDER', refId: { in: orderIds } } });
          await tx.salesOrderHistory.deleteMany({ where: { orderId: { in: orderIds } } });
          await tx.salesOrderItem.deleteMany({ where: { orderId: { in: orderIds } } });
          await tx.salesOrder.deleteMany({ where: { id: { in: orderIds } } });
        }
        if (quoteIds.length) {
          await tx.salesQuoteItem.deleteMany({ where: { quoteId: { in: quoteIds } } });
          await tx.salesQuote.deleteMany({ where: { id: { in: quoteIds } } });
        }
        await tx.contact.delete({ where: { id: contactId! } });
        if (productIds.length) {
          await tx.stockLevel.deleteMany({ where: { productId: { in: productIds } } });
          await tx.product.deleteMany({ where: { id: { in: productIds } } });
        }
      });
    }
    assert.equal(await prisma.salesQuote.count({ where: { number: { startsWith: prefix } } }), 0);
    assert.equal(await prisma.product.count({ where: { code: { startsWith: prefix } } }), 0);
  }
}

main().finally(() => prisma.$disconnect());
