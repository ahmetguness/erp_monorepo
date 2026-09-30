import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_LOT_${Date.now()}`;
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
  const foreign = await login('pro@axondemo.com', 'axon-pro-demo');
  const unauthorized = await login('muhasebe@axondemo.com', 'axon-demo');
  let productId = '', secondProductId = '', foreignProductId = '', batchId = '', foreignBatchId = '', warehouseId = '', foreignOrderId = '';
  const lotIds: string[] = [];
  try {
    assert.equal((await api(null, 'GET', '/api/lot-serials')).status, 401);
    assert.equal((await api(unauthorized, 'GET', '/api/lot-serials')).status, 403);
    assert.equal((await api(unauthorized, 'POST', '/api/lot-serials', {})).status, 403);
    assert.equal((await api(unauthorized, 'POST', '/api/lot-serials/x/assign', {})).status, 403);
    for (const query of ['page=0', 'page=x', 'limit=0', 'limit=101', 'isUsed=x', `search=${'x'.repeat(101)}`])
      assert.equal((await api(owner, 'GET', `/api/lot-serials?${query}`)).status, 400, query);
    assert.equal((await api(owner, 'GET', `/api/lot-serials/traceability?serialNumber=${'x'.repeat(201)}`)).status, 400);

    const [unit, foreignUnit] = await Promise.all([
      prisma.unit.findFirstOrThrow({ where: { tenantId: owner.tenantId } }),
      prisma.unit.findFirstOrThrow({ where: { tenantId: foreign.tenantId } }),
    ]);
    const [product, secondProduct, foreignProduct, warehouse] = await Promise.all([
      prisma.product.create({ data: { tenantId: owner.tenantId, unitId: unit.id, code: `${marker}_P1`, name: `${marker} Türkçe Ürün` } }),
      prisma.product.create({ data: { tenantId: owner.tenantId, unitId: unit.id, code: `${marker}_P2`, name: `${marker} İkinci Ürün` } }),
      prisma.product.create({ data: { tenantId: foreign.tenantId, unitId: foreignUnit.id, code: `${marker}_FP`, name: `${marker} Foreign` } }),
      prisma.warehouse.create({ data: { tenantId: owner.tenantId, code: `${marker}_W`, name: `${marker} Depo` } }),
    ]);
    productId = product.id; secondProductId = secondProduct.id; foreignProductId = foreignProduct.id; warehouseId = warehouse.id;
    await prisma.location.create({ data: { tenantId: owner.tenantId, warehouseId, code: `${marker}_L`, name: `${marker} Raf` } });
    const [batch, foreignBatch] = await Promise.all([
      prisma.productBatch.create({ data: { tenantId: owner.tenantId, productId, batchNumber: `${marker}_B`, quantity: 10 } }),
      prisma.productBatch.create({ data: { tenantId: foreign.tenantId, productId: foreignProductId, batchNumber: `${marker}_FB`, quantity: 10 } }),
    ]);
    batchId = batch.id; foreignBatchId = foreignBatch.id;

    for (const payload of [
      {}, { productId, serialNumber: '   ' }, { productId, serialNumber: 'x'.repeat(201) },
      { productId: 'not-found', serialNumber: `${marker}_X` },
      { productId: foreignProductId, serialNumber: `${marker}_FOREIGN_PRODUCT` },
      { productId, batchId: foreignBatchId, serialNumber: `${marker}_FOREIGN_BATCH` },
      { productId: secondProductId, batchId, serialNumber: `${marker}_WRONG_PRODUCT` },
    ]) assert.equal((await api(owner, 'POST', '/api/lot-serials', payload)).status, 400, JSON.stringify(payload));

    const valid = { productId, batchId, serialNumber: `${marker}_SERİ_ŞĞÜ` };
    const concurrent = await Promise.all([
      api(owner, 'POST', '/api/lot-serials', valid), api(owner, 'POST', '/api/lot-serials', valid),
    ]);
    assert.deepEqual(concurrent.map((result) => result.status).sort(), [201, 409]);
    const lotId = concurrent.find((result) => result.status === 201)!.body.data.id as string; lotIds.push(lotId);
    assert.equal(await prisma.lotSerialNumber.count({ where: { tenantId: owner.tenantId, productId, serialNumber: valid.serialNumber } }), 1);
    const stored = await prisma.lotSerialNumber.findUniqueOrThrow({ where: { id: lotId } });
    assert.equal(stored.batchId, batchId); assert.equal(stored.isUsed, false); assert.equal(stored.serialNumber, valid.serialNumber);

    await prisma.lotSerialNumber.createMany({ data: Array.from({ length: 21 }, (_, index) => ({ tenantId: owner.tenantId, productId, batchId, serialNumber: `${marker}_PAGE_${index}`, isUsed: index === 0, usedAt: index === 0 ? new Date() : null, usedRefType: index === 0 ? 'OTHER' : null, usedRefId: index === 0 ? marker : null })) });
    const extras = await prisma.lotSerialNumber.findMany({ where: { serialNumber: { startsWith: `${marker}_PAGE_` } }, select: { id: true } }); lotIds.push(...extras.map((row) => row.id));
    const searched = await api(owner, 'GET', `/api/lot-serials?search=${encodeURIComponent(valid.serialNumber)}&isUsed=false&limit=1`);
    assert.equal(searched.status, 200); assert.equal(searched.body.meta.total, 1); assert.equal(searched.body.data[0].id, lotId);
    assert.equal((await api(owner, 'GET', `/api/lot-serials?search=${encodeURIComponent(marker)}&isUsed=true`)).body.meta.total, 1);
    const paged = await api(owner, 'GET', `/api/lot-serials?search=${encodeURIComponent(marker)}&page=2&limit=20`);
    assert.equal(paged.status, 200); assert.equal(paged.body.meta.total, 22); assert.equal(paged.body.data.length, 2);

    const traced = await api(owner, 'GET', `/api/lot-serials/traceability?serialNumber=${encodeURIComponent(valid.serialNumber)}`);
    assert.equal(traced.status, 200); assert.equal(traced.body.data.summary.lotCount, 1); assert.equal(traced.body.data.summary.batchCount, 1);
    assert.ok(traced.body.data.items.some((item: any) => item.sourceType === 'LOT_SERIAL' && item.sourceId === lotId));

    const foreignContact = await prisma.contact.findFirstOrThrow({ where: { tenantId: foreign.tenantId } });
    const foreignOrder = await prisma.salesOrder.create({ data: { tenantId: foreign.tenantId, contactId: foreignContact.id, number: `${marker}_FSO`, date: new Date(), status: 'DRAFT' } }); foreignOrderId = foreignOrder.id;
    for (const payload of [
      {}, { usedRefType: 'INVALID', usedRefId: marker }, { usedRefType: 'SALES_ORDER', usedRefId: 'not-found' },
      { usedRefType: 'SALES_ORDER', usedRefId: foreignOrderId }, { usedRefType: 'OTHER', usedRefId: ' '.repeat(2) },
      { usedRefType: 'OTHER', usedRefId: 'x'.repeat(201) },
    ]) assert.ok([400, 404].includes((await api(owner, 'POST', `/api/lot-serials/${lotId}/assign`, payload)).status), JSON.stringify(payload));

    const assignments = await Promise.all([
      api(owner, 'POST', `/api/lot-serials/${lotId}/assign`, { usedRefType: 'OTHER', usedRefId: `${marker}_REF_A` }),
      api(owner, 'POST', `/api/lot-serials/${lotId}/assign`, { usedRefType: 'OTHER', usedRefId: `${marker}_REF_B` }),
    ]);
    assert.deepEqual(assignments.map((result) => result.status).sort(), [200, 409]);
    const assigned = await prisma.lotSerialNumber.findUniqueOrThrow({ where: { id: lotId } });
    assert.equal(assigned.isUsed, true); assert.ok(assigned.usedAt); assert.ok([`${marker}_REF_A`, `${marker}_REF_B`].includes(assigned.usedRefId ?? ''));
    assert.equal((await api(owner, 'POST', `/api/lot-serials/${lotId}/assign`, { usedRefType: 'OTHER', usedRefId: `${marker}_REF_C` })).status, 409);
    assert.equal((await api(foreign, 'POST', `/api/lot-serials/${lotId}/assign`, { usedRefType: 'OTHER', usedRefId: marker })).status, 404);
    assert.equal((await api(foreign, 'GET', `/api/lot-serials?search=${encodeURIComponent(marker)}`)).body.meta.total, 0);
    assert.equal((await api(foreign, 'GET', `/api/lot-serials/traceability?lotId=${lotId}`)).body.data.summary.lotCount, 0);

    const badMovement = await api(owner, 'POST', '/api/stock/movements', { productId: secondProductId, warehouseId, type: 'IN', quantity: 1, unitCost: 1, lotId, idempotencyKey: `${marker}_BAD_MOVEMENT` });
    assert.equal(badMovement.status, 400); assert.equal(await prisma.stockMovement.count({ where: { idempotencyKey: `${marker}_BAD_MOVEMENT` } }), 0);
    console.log('PASS lot/serial assurance: CRUD, validation, pagination, search, concurrency, ownership, assignment and traceability');
  } finally {
    await prisma.stockMovement.deleteMany({ where: { idempotencyKey: { startsWith: marker } } });
    await prisma.lotSerialNumber.deleteMany({ where: { OR: [{ id: { in: lotIds } }, { serialNumber: { startsWith: marker } }] } });
    if (foreignOrderId) { await prisma.salesOrderHistory.deleteMany({ where: { orderId: foreignOrderId } }); await prisma.salesOrder.deleteMany({ where: { id: foreignOrderId } }); }
    if (batchId || foreignBatchId) await prisma.productBatch.deleteMany({ where: { id: { in: [batchId, foreignBatchId].filter(Boolean) } } });
    if (productId || secondProductId) { await prisma.stockLevel.deleteMany({ where: { productId: { in: [productId, secondProductId].filter(Boolean) } } }); await prisma.product.deleteMany({ where: { id: { in: [productId, secondProductId].filter(Boolean) } } }); }
    if (foreignProductId) await prisma.product.deleteMany({ where: { id: foreignProductId } });
    if (warehouseId) { await prisma.location.deleteMany({ where: { warehouseId } }); await prisma.warehouse.deleteMany({ where: { id: warehouseId } }); }
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
