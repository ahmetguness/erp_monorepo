import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_BATCH_${Date.now()}`;
type Session = { cookie: string; tenantId: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'demo1234', tenantSlug }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  return { cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', tenantId: body.data.tenant.id };
}

async function api(session: Session | null, method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: any = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* response may be plain text */ }
  return { status: response.status, body: parsed };
}

async function main() {
  const owner = await login('admin@axondemo.com', 'axon-demo');
  const foreign = await login('pro@axondemo.com', 'axon-pro-demo');
  const unauthorized = await login('muhasebe@axondemo.com', 'axon-demo');
  let productId = '';
  let secondProductId = '';
  let foreignProductId = '';
  let warehouseId = '';
  const batchIds: string[] = [];
  try {
    assert.equal((await api(null, 'GET', '/api/product-batches')).status, 401);
    assert.equal((await api(unauthorized, 'GET', '/api/product-batches')).status, 403);
    assert.equal((await api(unauthorized, 'POST', '/api/product-batches', {})).status, 403);
    assert.equal((await api(unauthorized, 'PATCH', '/api/product-batches/x', {})).status, 403);
    for (const query of ['page=0', 'page=x', 'limit=0', 'limit=101', 'status=INVALID', `search=${'x'.repeat(101)}`])
      assert.equal((await api(owner, 'GET', `/api/product-batches?${query}`)).status, 400, query);

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

    const valid = { productId, batchNumber: `${marker}_MAIN`, manufacturedAt: '2026-01-10', expiryDate: '2027-01-10', quantity: 12.345, notes: 'Türkçe açıklama şğüİ !?' };
    const invalidPayloads = [
      {}, { ...valid, productId: '' }, { ...valid, batchNumber: '   ' },
      { ...valid, productId: 'not-found' }, { ...valid, productId: foreignProductId },
      { ...valid, quantity: -1 }, { ...valid, quantity: 0.0001 }, { ...valid, quantity: 1e15 },
      { ...valid, quantity: null }, { ...valid, manufacturedAt: 'bad' },
      { ...valid, expiryDate: '2026-02-30' },
      { ...valid, manufacturedAt: '2027-01-11', expiryDate: '2027-01-10' },
      { ...valid, batchNumber: 'x'.repeat(101) }, { ...valid, notes: 'x'.repeat(2001) },
    ];
    for (const payload of invalidPayloads)
      assert.equal((await api(owner, 'POST', '/api/product-batches', payload)).status, 400, JSON.stringify(payload));

    const created = await api(owner, 'POST', '/api/product-batches', valid);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const batchId = created.body.data.id as string; batchIds.push(batchId);
    assert.equal(Number(created.body.data.quantity), 12.345);
    const stored = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId } });
    assert.equal(stored.tenantId, owner.tenantId);
    assert.equal(stored.productId, productId);
    assert.equal(stored.batchNumber, valid.batchNumber);
    assert.equal(stored.notes, valid.notes);
    assert.equal(Number(stored.quantity), 12.345);

    const duplicate = await Promise.all([
      api(owner, 'POST', '/api/product-batches', { ...valid, batchNumber: `${marker}_RACE` }),
      api(owner, 'POST', '/api/product-batches', { ...valid, batchNumber: `${marker}_RACE` }),
    ]);
    assert.equal(duplicate.filter((result) => result.status === 201).length, 1);
    assert.deepEqual(duplicate.map((result) => result.status).sort(), [201, 409]);
    assert.equal(await prisma.productBatch.count({ where: { tenantId: owner.tenantId, productId, batchNumber: `${marker}_RACE` } }), 1);
    const race = await prisma.productBatch.findUniqueOrThrow({ where: { tenantId_productId_batchNumber: { tenantId: owner.tenantId, productId, batchNumber: `${marker}_RACE` } } });
    batchIds.push(race.id);

    await prisma.productBatch.createMany({ data: Array.from({ length: 21 }, (_, index) => ({
      tenantId: owner.tenantId, productId, batchNumber: `${marker}_PAGE_${index}`, quantity: index === 0 ? 0 : 1,
      expiryDate: index === 1 ? new Date('2025-01-01') : index === 2 ? new Date(Date.now() + 10 * 86_400_000) : index === 3 ? new Date(new Date().toISOString().slice(0, 10)) : null,
    })) });
    const extras = await prisma.productBatch.findMany({ where: { tenantId: owner.tenantId, batchNumber: { startsWith: `${marker}_PAGE_` } }, select: { id: true } });
    batchIds.push(...extras.map((row) => row.id));
    const searched = await api(owner, 'GET', `/api/product-batches?search=${encodeURIComponent(`${marker}_MAIN`)}&status=active&limit=1`);
    assert.equal(searched.status, 200); assert.equal(searched.body.meta.total, 1); assert.equal(searched.body.data[0].id, batchId);
    assert.equal((await api(owner, 'GET', `/api/product-batches?search=${encodeURIComponent(marker)}&status=empty`)).body.meta.total, 1);
    assert.equal((await api(owner, 'GET', `/api/product-batches?search=${encodeURIComponent(marker)}&status=expired`)).body.meta.total, 1);
    assert.equal((await api(owner, 'GET', `/api/product-batches?search=${encodeURIComponent(marker)}&status=expiring`)).body.meta.total, 2);
    const paged = await api(owner, 'GET', `/api/product-batches?search=${encodeURIComponent(marker)}&page=2&limit=20`);
    assert.equal(paged.status, 200); assert.ok(paged.body.meta.total >= 23); assert.ok(paged.body.data.length >= 3);

    for (const payload of [{}, { quantity: -1 }, { quantity: 0.0001 }, { expiryDate: 'bad' }, { manufacturedAt: '2028-01-01', expiryDate: '2027-01-01' }, { notes: 'x'.repeat(2001) }])
      assert.equal((await api(owner, 'PATCH', `/api/product-batches/${batchId}`, payload)).status, 400, JSON.stringify(payload));
    const updated = await api(owner, 'PATCH', `/api/product-batches/${batchId}`, { quantity: 0, expiryDate: '', manufacturedAt: '2026-02-01', notes: ' Güncellendi ' });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(Number(updated.body.data.quantity), 0); assert.equal(updated.body.data.expiryDate, null); assert.equal(updated.body.data.notes, 'Güncellendi');
    const updatedDb = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId } });
    assert.equal(Number(updatedDb.quantity), 0); assert.equal(updatedDb.expiryDate, null); assert.equal(updatedDb.notes, 'Güncellendi');
    assert.equal((await api(owner, 'PATCH', '/api/product-batches/not-found', { quantity: 1 })).status, 404);
    assert.equal((await api(foreign, 'PATCH', `/api/product-batches/${batchId}`, { quantity: 99 })).status, 404);
    assert.equal((await api(foreign, 'GET', `/api/product-batches?productId=${productId}`)).body.meta.total, 0);

    assert.equal((await api(owner, 'POST', '/api/lot-serials', { productId: secondProductId, batchId, serialNumber: `${marker}_BAD_LOT` })).status, 400);
    assert.equal(await prisma.lotSerialNumber.count({ where: { serialNumber: `${marker}_BAD_LOT` } }), 0);
    const lot = await api(owner, 'POST', '/api/lot-serials', { productId, batchId, serialNumber: `${marker}_LOT` });
    assert.equal(lot.status, 201, JSON.stringify(lot.body));
    const trace = await api(owner, 'GET', `/api/lot-serials/traceability?batchId=${batchId}`);
    assert.equal(trace.status, 200); assert.equal(trace.body.data.summary.batchCount, 1); assert.equal(trace.body.data.summary.lotCount, 1);
    const movement = await api(owner, 'POST', '/api/stock/movements', { productId: secondProductId, warehouseId, type: 'IN', quantity: 1, unitCost: 1, batchId, idempotencyKey: `${marker}_BAD_MOVEMENT` });
    assert.equal(movement.status, 400, JSON.stringify(movement.body));
    assert.equal(await prisma.stockMovement.count({ where: { idempotencyKey: `${marker}_BAD_MOVEMENT` } }), 0);

    console.log('PASS product batches assurance: validation, CRUD, pagination, filters, concurrency, tenant isolation and traceability');
  } finally {
    await prisma.lotSerialNumber.deleteMany({ where: { serialNumber: { startsWith: marker } } });
    await prisma.stockMovement.deleteMany({ where: { idempotencyKey: { startsWith: marker } } });
    await prisma.productBatch.deleteMany({ where: { OR: [{ id: { in: batchIds } }, { batchNumber: { startsWith: marker } }] } });
    if (productId || secondProductId) {
      await prisma.stockLevel.deleteMany({ where: { productId: { in: [productId, secondProductId].filter(Boolean) } } });
      await prisma.product.deleteMany({ where: { id: { in: [productId, secondProductId].filter(Boolean) } } });
    }
    if (foreignProductId) await prisma.product.deleteMany({ where: { id: foreignProductId } });
    if (warehouseId) { await prisma.location.deleteMany({ where: { warehouseId } }); await prisma.warehouse.deleteMany({ where: { id: warehouseId } }); }
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
