import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_PUR_ORDER_${Date.now()}`;
type Session = { cookie: string; tenantId: string };
async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug }) });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  return { cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', tenantId: body.data.tenant.id };
}
async function api(session: Session | null, method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function main() {
  const owner = await login('admin@axondemo.com', 'axon-demo');
  const foreign = await login('starter@axondemo.com', 'axon-starter-demo');
  const unauthorized = await login('muhasebe@axondemo.com', 'axon-demo');
  const productIds: string[] = [], contactIds: string[] = [], orderIds: string[] = [];
  let initialStock = 0;
  let productId = '';
  let warehouseId = '';
  try {
    assert.equal((await api(null, 'GET', '/api/purchase-orders')).status, 401);
    assert.equal((await api(unauthorized, 'GET', '/api/purchase-orders')).status, 403);
    for (const path of ['?status=BAD', '?page=0', '?limit=101', '?dateFrom=bad', '?dateFrom=2026-12-01&dateTo=2026-01-01', '?minTotal=20&maxTotal=10']) assert.equal((await api(owner, 'GET', `/api/purchase-orders${path}`)).status, 400, path);
    const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: owner.tenantId } });
    const foreignUnit = await prisma.unit.findFirstOrThrow({ where: { tenantId: foreign.tenantId } });
    const product = await prisma.product.create({ data: { tenantId: owner.tenantId, unitId: unit.id, code: `${marker}_P`, name: `${marker}_ÜRÜN`, purchasePrice: 100 } });
    productId = product.id; productIds.push(product.id);
    const foreignProduct = await prisma.product.create({ data: { tenantId: foreign.tenantId, unitId: foreignUnit.id, code: `${marker}_FP`, name: `${marker}_FOREIGN`, purchasePrice: 20 } });
    productIds.push(foreignProduct.id);
    const supplier = await prisma.contact.create({ data: { tenantId: owner.tenantId, type: 'SUPPLIER', name: `${marker}_SUPPLIER`, code: `${marker}_S` } }); contactIds.push(supplier.id);
    const customer = await prisma.contact.create({ data: { tenantId: owner.tenantId, type: 'CUSTOMER', name: `${marker}_CUSTOMER`, code: `${marker}_C` } }); contactIds.push(customer.id);
    const foreignSupplier = await prisma.contact.create({ data: { tenantId: foreign.tenantId, type: 'SUPPLIER', name: `${marker}_FS`, code: `${marker}_FS` } }); contactIds.push(foreignSupplier.id);
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { tenantId: owner.tenantId, isActive: true } }); warehouseId = warehouse.id;
    initialStock = Number((await prisma.stockLevel.findFirst({ where: { tenantId: owner.tenantId, productId, warehouseId } }))?.quantity ?? 0);
    const valid = { contactId: supplier.id, date: '2026-09-29', dueDate: '2026-10-10', notes: `${marker} Türkçe`, items: [{ productId, description: 'Test kalemi', quantity: 4, unitPrice: 100, discount: 10, taxRate: 20 }] };
    for (const invalid of [{}, { ...valid, extra: true }, { ...valid, date: 'bad' }, { ...valid, dueDate: '2026-01-01' }, { ...valid, contactId: customer.id }, { ...valid, contactId: foreignSupplier.id }, { ...valid, items: [] }, { ...valid, items: [{ ...valid.items[0], quantity: 0 }] }, { ...valid, items: [{ ...valid.items[0], unitPrice: -1 }] }, { ...valid, items: [{ ...valid.items[0], discount: 101 }] }, { ...valid, items: [{ ...valid.items[0], taxRate: -1 }] }, { ...valid, items: [{ ...valid.items[0], productId: foreignProduct.id }] }, { ...valid, items: [valid.items[0], valid.items[0]] }]) assert.equal((await api(owner, 'POST', '/api/purchase-orders', invalid)).status, 400);
    const created = await api(owner, 'POST', '/api/purchase-orders', valid); assert.equal(created.status, 201, JSON.stringify(created.body));
    const orderId = created.body.data.id; orderIds.push(orderId);
    assert.equal(created.body.data.status, 'DRAFT'); assert.equal(Number(created.body.data.totalNet), 360); assert.equal(Number(created.body.data.totalTax), 72); assert.equal(Number(created.body.data.totalGross), 432);
    const stored = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, history: true } });
    assert.equal(stored.tenantId, owner.tenantId); assert.equal(stored.createdById !== null, true); assert.equal(stored.history.length, 1); assert.equal(Number(stored.items[0].lineTotal), 432);
    assert.ok([403, 404].includes((await api(foreign, 'GET', `/api/purchase-orders/${orderId}`)).status));
    const filtered = await api(owner, 'GET', `/api/purchase-orders?search=${encodeURIComponent(marker)}&status=DRAFT&contactId=${supplier.id}&minTotal=431&maxTotal=433`); assert.equal(filtered.body.meta.total, 1);
    const sends = await Promise.all([api(owner, 'POST', `/api/purchase-orders/${orderId}/send`), api(owner, 'POST', `/api/purchase-orders/${orderId}/send`)]); assert.deepEqual(sends.map((item) => item.status).sort(), [200, 409]);
    const sent = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } }); const itemId = sent.items[0].id;
    assert.equal((await api(owner, 'POST', `/api/purchase-orders/${orderId}/receive`, { warehouseId, idempotencyKey: `${marker}_R1`, items: [{ itemId, receivedQty: 1 }] })).body.data.status, 'PARTIALLY_RECEIVED');
    const replay = await api(owner, 'POST', `/api/purchase-orders/${orderId}/receive`, { warehouseId, idempotencyKey: `${marker}_R1`, items: [{ itemId, receivedQty: 1 }] }); assert.equal(replay.status, 200);
    assert.equal(await prisma.deliveryNote.count({ where: { purchaseOrderId: orderId } }), 1);
    assert.equal((await api(owner, 'POST', `/api/purchase-orders/${orderId}/receive`, { warehouseId, idempotencyKey: `${marker}_OVER`, items: [{ itemId, receivedQty: 4 }] })).status, 400);
    const completed = await api(owner, 'POST', `/api/purchase-orders/${orderId}/receive`, { warehouseId, idempotencyKey: `${marker}_R2`, items: [{ itemId, receivedQty: 3 }] }); assert.equal(completed.body.data.status, 'RECEIVED');
    assert.equal(Number((await prisma.stockLevel.findFirstOrThrow({ where: { tenantId: owner.tenantId, productId, warehouseId } })).quantity), initialStock + 4);
    assert.equal((await api(owner, 'POST', `/api/purchase-orders/${orderId}/cancel`)).status, 409);
    const detail = await api(owner, 'GET', `/api/purchase-orders/${orderId}`); assert.equal(detail.status, 200); assert.equal(detail.body.data.trace.deliveryNotes.length, 2);
    const history = await api(owner, 'GET', `/api/purchase-orders/${orderId}/history`); assert.equal(history.body.data.length, 4);
    const match = await api(owner, 'GET', `/api/purchase-orders/${orderId}/three-way-match`); assert.equal(match.status, 200); assert.equal(match.body.data.summary.receivedQuantity, 4); assert.equal(match.body.data.summary.invoiceCount, 0);
    const cancelCreate = await api(owner, 'POST', '/api/purchase-orders', { ...valid, notes: `${marker}_CANCEL` }); const cancelId = cancelCreate.body.data.id; orderIds.push(cancelId);
    const cancels = await Promise.all([api(owner, 'POST', `/api/purchase-orders/${cancelId}/cancel`), api(owner, 'POST', `/api/purchase-orders/${cancelId}/cancel`)]); assert.deepEqual(cancels.map((item) => item.status).sort(), [200, 409]);
    assert.equal((await api(owner, 'POST', `/api/purchase-orders/${cancelId}/send`)).status, 409);
    console.log('PASS purchase orders assurance');
  } finally {
    if (productId && warehouseId) {
      await prisma.stockMovement.deleteMany({ where: { tenantId: owner.tenantId, productId, refId: { in: orderIds } } });
      const level = await prisma.stockLevel.findFirst({ where: { tenantId: owner.tenantId, productId, warehouseId } });
      if (level) await prisma.stockLevel.update({ where: { id: level.id }, data: { quantity: initialStock } });
    }
    await prisma.deliveryNote.deleteMany({ where: { purchaseOrderId: { in: orderIds } } });
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
    await prisma.auditLog.deleteMany({ where: { module: 'purchasing', entityId: { in: orderIds } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
