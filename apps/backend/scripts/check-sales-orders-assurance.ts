import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const prefix = `TEST_E2E_ORDER_${Date.now()}`;
type Session = { cookie: string; tenantId: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug }) });
  assert.equal(response.status, 200);
  const json = await response.json() as any;
  return { cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', tenantId: json.data.tenant.id };
}

async function api(session: Session | null, method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function main() {
  const owner = await login('admin@axondemo.com', 'axon-demo');
  const tenantB = await login('starter@axondemo.com', 'axon-starter-demo');
  const warehouseUser = await login('depo@axondemo.com', 'axon-demo');
  let contactId: string | null = null;
  const productIds: string[] = [];
  try {
    assert.equal((await api(null, 'GET', '/api/sales-orders')).status, 401);
    assert.equal((await api(warehouseUser, 'GET', '/api/sales-orders')).status, 403);
    const contact = await api(owner, 'POST', '/api/contacts', { type: 'CUSTOMER', name: `${prefix}_CUSTOMER`, code: `${prefix}_CUSTOMER` });
    assert.equal(contact.status, 201);
    contactId = contact.body.data.id;
    const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: owner.tenantId } });
    const location = await prisma.location.findFirstOrThrow({ where: { tenantId: owner.tenantId, isActive: true, warehouse: { isActive: true } }, include: { warehouse: true } });
    for (let index = 1; index <= 2; index += 1) {
      const product = await prisma.product.create({ data: { tenantId: owner.tenantId, unitId: unit.id, code: `${prefix}_P${index}`, name: `${prefix}_PRODUCT_${index}`, salesPrice: index === 1 ? 1000 : 500 } });
      productIds.push(product.id);
      await prisma.stockLevel.create({ data: { tenantId: owner.tenantId, productId: product.id, warehouseId: location.warehouseId, locationId: location.id, quantity: 20 } });
    }
    const date = new Date();
    const dueDate = new Date(date.getTime() + 14 * 86_400_000);
    const payload = { contactId, number: `${prefix}_MAIN`, date: date.toISOString(), dueDate: dueDate.toISOString(), notes: 'Türkçe sipariş notu', items: [
      { productId: productIds[0], description: 'Birinci ürün', quantity: 2, unitPrice: 1000, discount: 10, taxRate: 20 },
      { productId: productIds[1], description: 'İkinci ürün', quantity: 3, unitPrice: 500, discount: 0, taxRate: 10 },
    ] };

    const invalids: any[] = [
      {}, { ...payload, contactId: ' ' }, { ...payload, items: [] },
      { ...payload, items: [{ ...payload.items[0], quantity: 0 }] },
      { ...payload, items: [{ ...payload.items[0], quantity: -1 }] },
      { ...payload, items: [{ ...payload.items[0], unitPrice: -1 }] },
      { ...payload, items: [{ ...payload.items[0], discount: 101 }] },
      { ...payload, date: 'invalid' },
      { ...payload, dueDate: new Date(date.getTime() - 86_400_000).toISOString() },
      { ...payload, notes: 'x'.repeat(2001) }, { ...payload, unexpected: true },
    ];
    for (const invalid of invalids) assert.equal((await api(owner, 'POST', '/api/sales-orders', invalid)).status, 400);
    const otherContact = await prisma.contact.findFirstOrThrow({ where: { tenantId: tenantB.tenantId, deletedAt: null } });
    const otherProduct = await prisma.product.findFirstOrThrow({ where: { tenantId: tenantB.tenantId, deletedAt: null } });
    assert.equal((await api(owner, 'POST', '/api/sales-orders', { ...payload, number: `${prefix}_CROSS_C`, contactId: otherContact.id })).status, 400);
    assert.equal((await api(owner, 'POST', '/api/sales-orders', { ...payload, number: `${prefix}_CROSS_P`, items: [{ ...payload.items[0], productId: otherProduct.id }] })).status, 400);

    const created = await api(owner, 'POST', '/api/sales-orders', payload);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const orderId = created.body.data.id as string;
    assert.equal(Number(created.body.data.totalNet), 3300);
    assert.equal(Number(created.body.data.totalTax), 510);
    assert.equal(Number(created.body.data.totalGross), 3810);
    assert.equal((await api(owner, 'POST', '/api/sales-orders', payload)).status, 409);
    const stored = await prisma.salesOrder.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, history: true } });
    assert.equal(stored.items.length, 2);
    assert.equal(stored.history.length, 1);
    assert.equal((await api(tenantB, 'GET', `/api/sales-orders/${orderId}`)).status, 404);
    assert.equal((await api(tenantB, 'PATCH', `/api/sales-orders/${orderId}`, { notes: 'cross' })).status, 404);
    assert.equal((await api(tenantB, 'POST', `/api/sales-orders/${orderId}/fulfill`, {})).status, 404);
    assert.equal((await api(owner, 'GET', '/api/sales-orders/not-found')).status, 404);
    assert.equal((await api(owner, 'PATCH', `/api/sales-orders/${orderId}`, { dueDate: 'bad-date' })).status, 400);
    assert.equal((await api(owner, 'PATCH', `/api/sales-orders/${orderId}`, { notes: 'TEST_E2E_UPDATED', unknown: true })).status, 400);
    assert.equal((await api(owner, 'PATCH', `/api/sales-orders/${orderId}`, { notes: 'TEST_E2E_UPDATED' })).status, 200);
    assert.equal((await prisma.salesOrder.findUniqueOrThrow({ where: { id: orderId } })).notes, 'TEST_E2E_UPDATED');
    assert.equal((await api(owner, 'PATCH', `/api/sales-orders/${orderId}`, { status: 'DELIVERED' })).status, 400);

    await prisma.salesOrder.createMany({ data: Array.from({ length: 23 }, (_, index) => ({ tenantId: owner.tenantId, contactId: contactId!, number: `${prefix}_PAGE_${index}`, date, status: index % 2 ? 'CONFIRMED' : 'DRAFT', totalGross: 100, invoicedAmount: index % 3 ? 25 : 0 })) });
    const page1 = await api(owner, 'GET', `/api/sales-orders?search=${prefix}_PAGE&page=1&limit=10`);
    const page3 = await api(owner, 'GET', `/api/sales-orders?search=${prefix}_PAGE&page=3&limit=10`);
    assert.equal(page1.body.meta.totalPages, 3);
    assert.equal(page3.body.data.length, 3);
    assert.deepEqual(page1.body.summary, page3.body.summary);
    assert.equal(page1.body.summary.total, 23);
    assert.equal(page1.body.summary.confirmedCount, 11);
    assert.equal(page1.body.summary.waitingDeliveryCount, 11);
    assert.equal(page1.body.summary.totalGross, 2300);
    assert.equal(page1.body.summary.uninvoicedAmount, 1925);
    const filtered = await api(owner, 'GET', `/api/sales-orders?search=${prefix}_PAGE&status=CONFIRMED&limit=100`);
    assert.equal(filtered.body.meta.total, 11);
    assert.ok(filtered.body.data.every((row: any) => row.status === 'CONFIRMED'));

    const insufficient = await api(owner, 'POST', '/api/sales-orders', {
      ...payload,
      number: `${prefix}_INSUFFICIENT`,
      items: [{ ...payload.items[0], quantity: 999999 }],
    });
    const insufficientId = insufficient.body.data.id as string;
    assert.equal((await api(owner, 'POST', `/api/sales-orders/${insufficientId}/fulfill`, { warehouseId: location.warehouseId, allowPartialReservation: false })).status, 400);
    assert.equal((await prisma.salesOrder.findUniqueOrThrow({ where: { id: insufficientId } })).status, 'DRAFT');
    assert.equal(await prisma.inventoryReservation.count({ where: { refType: 'SALES_ORDER', refId: insufficientId, releasedAt: null } }), 0);

    const cancellable = await api(owner, 'POST', '/api/sales-orders', { ...payload, number: `${prefix}_CANCEL` });
    const cancellableId = cancellable.body.data.id as string;
    assert.equal((await api(owner, 'POST', `/api/sales-orders/${cancellableId}/fulfill`, { warehouseId: location.warehouseId, createDeliveryDraft: false, createInvoiceDraft: false })).status, 200);
    assert.ok(await prisma.inventoryReservation.count({ where: { refType: 'SALES_ORDER', refId: cancellableId, releasedAt: null } }) > 0);
    assert.equal((await api(owner, 'POST', `/api/sales-orders/${cancellableId}/cancel`)).status, 200);
    assert.equal(await prisma.inventoryReservation.count({ where: { refType: 'SALES_ORDER', refId: cancellableId, releasedAt: null } }), 0);
    assert.equal((await api(owner, 'POST', `/api/sales-orders/${cancellableId}/cancel`)).status, 400);

    const fulfilled = await api(owner, 'POST', `/api/sales-orders/${orderId}/fulfill`, { warehouseId: location.warehouseId, allowPartialReservation: false, createDeliveryDraft: true, createInvoiceDraft: true });
    assert.equal(fulfilled.status, 200, JSON.stringify(fulfilled.body));
    const deliveryId = fulfilled.body.data.deliveryNoteId as string;
    const invoiceId = fulfilled.body.data.invoiceId as string;
    assert.equal((await api(owner, 'POST', `/api/sales-orders/${orderId}/fulfill`, { warehouseId: location.warehouseId })).status, 200);
    assert.equal(await prisma.deliveryNote.count({ where: { salesOrderId: orderId, deletedAt: null } }), 1);
    assert.equal(await prisma.invoice.count({ where: { salesOrderId: orderId, deletedAt: null } }), 1);
    assert.equal((await api(owner, 'POST', `/api/sales-orders/${orderId}/cancel`)).status, 400);
    assert.equal((await api(owner, 'PATCH', `/api/delivery-notes/${deliveryId}/status`, { status: 'DELIVERED' })).status, 200);
    assert.equal((await api(owner, 'POST', `/api/invoices/${invoiceId}/approve`, { idempotencyKey: `${prefix}_APPROVE` })).status, 200);
    const payment = await api(owner, 'POST', '/api/payments', { contactId, date: date.toISOString(), amount: 1000, method: 'BANK_TRANSFER', direction: 'RECEIVE', reference: prefix, idempotencyKey: `${prefix}_PAY`, allocations: [{ invoiceId, amount: 1000 }] });
    assert.equal(payment.status, 201);
    const detail = await api(owner, 'GET', `/api/sales-orders/${orderId}`);
    assert.equal(Number(detail.body.data.invoicedAmount), 3810);
    const balance = await api(owner, 'GET', `/api/contacts/${contactId}`);
    assert.equal(balance.body.data.financials.currentBalance, 2810);
    const workspace = await api(owner, 'GET', `/api/sales-orders/${orderId}/process-workspace`);
    assert.ok(workspace.body.data.timeline.some((row: any) => row.kind === 'DELIVERY'));
    assert.ok(workspace.body.data.timeline.some((row: any) => row.kind === 'INVOICE'));
    assert.ok(workspace.body.data.timeline.some((row: any) => row.kind === 'PAYMENT'));
    console.log(JSON.stringify({ status: 'PASS', prefix, validations: invalids.length, pagination: page1.body.summary, totals: { net: 3300, tax: 510, gross: 3810 }, flow: { orderId, deliveryId, invoiceId, balance: 2810 } }, null, 2));
  } finally {
    if (contactId) {
      const orders = await prisma.salesOrder.findMany({ where: { contactId }, select: { id: true } });
      const orderIds = orders.map((row) => row.id);
      const invoices = await prisma.invoice.findMany({ where: { contactId }, select: { id: true } });
      const invoiceIds = invoices.map((row) => row.id);
      const deliveries = await prisma.deliveryNote.findMany({ where: { contactId }, select: { id: true } });
      const deliveryIds = deliveries.map((row) => row.id);
      const payments = await prisma.payment.findMany({ where: { contactId }, select: { id: true } });
      await prisma.$transaction(async (tx) => {
        if (invoiceIds.length) { await tx.paymentAllocation.deleteMany({ where: { invoiceId: { in: invoiceIds } } }); await tx.invoiceHistory.deleteMany({ where: { invoiceId: { in: invoiceIds } } }); await tx.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } }); }
        await tx.accountEntry.deleteMany({ where: { contactId: contactId! } });
        if (payments.length) await tx.payment.deleteMany({ where: { id: { in: payments.map((row) => row.id) } } });
        if (invoiceIds.length) await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
        if (deliveryIds.length) { const moves = await tx.stockMovement.findMany({ where: { refType: 'DELIVERY_NOTE', refId: { in: deliveryIds } }, select: { id: true } }); await tx.stockValuation.deleteMany({ where: { movementId: { in: moves.map((row) => row.id) } } }); await tx.stockMovement.deleteMany({ where: { refType: 'DELIVERY_NOTE', refId: { in: deliveryIds } } }); await tx.deliveryNoteItem.deleteMany({ where: { deliveryNoteId: { in: deliveryIds } } }); await tx.deliveryNote.deleteMany({ where: { id: { in: deliveryIds } } }); }
        if (orderIds.length) { await tx.inventoryReservation.deleteMany({ where: { refType: 'SALES_ORDER', refId: { in: orderIds } } }); await tx.salesOrderHistory.deleteMany({ where: { orderId: { in: orderIds } } }); await tx.salesOrderItem.deleteMany({ where: { orderId: { in: orderIds } } }); await tx.salesOrder.deleteMany({ where: { id: { in: orderIds } } }); }
        await tx.contact.delete({ where: { id: contactId! } });
        await tx.stockLevel.deleteMany({ where: { productId: { in: productIds } } });
        await tx.product.deleteMany({ where: { id: { in: productIds } } });
      });
    }
    assert.equal(await prisma.salesOrder.count({ where: { number: { startsWith: prefix } } }), 0);
  }
}

main().finally(() => prisma.$disconnect());
