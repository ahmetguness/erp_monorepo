import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_PRODUCT_${Date.now()}`;
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
  let parsed: any = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* template is CSV */ }
  return { status: response.status, body: parsed, headers: response.headers };
}

async function main() {
  const owner = await login('admin@axondemo.com', 'axon-demo');
  const foreign = await login('starter@axondemo.com', 'axon-starter-demo');
  const unauthorized = await login('muhasebe@axondemo.com', 'axon-demo');
  const ids: string[] = [];
  try {
    const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: owner.tenantId } });
    const category = await prisma.category.findFirst({ where: { tenantId: owner.tenantId } });
    const taxRate = await prisma.taxRate.findFirst({ where: { tenantId: owner.tenantId } });
    const foreignUnit = await prisma.unit.findFirstOrThrow({ where: { tenantId: foreign.tenantId } });
    const foreignCategory = await prisma.category.findFirst({ where: { tenantId: foreign.tenantId } });
    const foreignTaxRate = await prisma.taxRate.findFirst({ where: { tenantId: foreign.tenantId } });

    assert.equal((await api(null, 'GET', '/api/products')).status, 401);
    assert.equal((await api(unauthorized, 'POST', '/api/products', {})).status, 403);
    assert.equal((await api(owner, 'GET', '/api/products?page=0&limit=999')).status, 200);

    const valid = { code: `${marker}_A`, name: `${marker}_Türkçe Ürün`, unitId: unit.id, categoryId: category?.id, taxRateId: taxRate?.id, barcode: `${Date.now()}`, description: 'Özel karakter !? şğı', purchasePrice: 100.25, salesPrice: 150.5, minStockLevel: 5.5, safetyStock: 2, reorderPoint: 4, reorderQty: 10, leadTimeDays: 3 };
    for (const invalid of [
      {}, { ...valid, code: '   ' }, { ...valid, name: '   ' }, { ...valid, purchasePrice: -1 },
      { ...valid, salesPrice: -1 }, { ...valid, minStockLevel: -1 }, { ...valid, safetyStock: -1 },
      { ...valid, leadTimeDays: 1.5 }, { ...valid, extra: true }, { ...valid, unitId: foreignUnit.id },
      ...(foreignCategory ? [{ ...valid, categoryId: foreignCategory.id }] : []),
      ...(foreignTaxRate ? [{ ...valid, taxRateId: foreignTaxRate.id }] : []),
    ]) assert.equal((await api(owner, 'POST', '/api/products', invalid)).status, 400, JSON.stringify(invalid));

    const created = await api(owner, 'POST', '/api/products', valid);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id as string; ids.push(id);
    assert.equal(Number(created.body.data.purchasePrice), 100.25);
    assert.equal(Number(created.body.data.salesPrice), 150.5);
    assert.equal((await api(owner, 'POST', '/api/products', valid)).status, 400);
    assert.equal((await api(unauthorized, 'PATCH', `/api/products/${id}`, { name: 'NOPE' })).status, 403);
    assert.equal((await api(unauthorized, 'DELETE', `/api/products/${id}`)).status, 403);

    const stored = await prisma.product.findUniqueOrThrow({ where: { id } });
    assert.equal(stored.tenantId, owner.tenantId);
    assert.equal(stored.name, valid.name);
    assert.equal(Number(stored.reorderQty), 10);
    assert.equal(await prisma.auditLog.count({ where: { tenantId: owner.tenantId, entityId: id, action: 'CREATE' } }), 1);

    assert.equal((await api(foreign, 'GET', `/api/products/${id}`)).status, 404);
    assert.equal((await api(foreign, 'PATCH', `/api/products/${id}`, { name: 'HACK' })).status, 404);
    assert.equal((await api(foreign, 'DELETE', `/api/products/${id}`)).status, 404);
    assert.equal((await api(owner, 'GET', '/api/products/not-found')).status, 404);
    assert.equal((await api(owner, 'PATCH', '/api/products/not-found', { name: 'x' })).status, 404);

    const searched = await api(owner, 'GET', `/api/products?search=${encodeURIComponent(marker)}&categoryId=${category?.id ?? ''}&isActive=true`);
    assert.equal(searched.status, 200); assert.equal(searched.body.meta.total, 1);
    const quality = await api(owner, 'GET', `/api/products?search=${encodeURIComponent(marker)}&minMargin=30&maxMargin=40&limit=1`);
    assert.equal(quality.body.meta.total, 1); assert.equal(quality.body.data.length, 1);
    const absent = await api(owner, 'GET', `/api/products?search=${encodeURIComponent(marker)}&missingPrice=true`);
    assert.equal(absent.body.meta.total, 0);

    assert.equal((await api(owner, 'PATCH', `/api/products/${id}`, { categoryId: foreignCategory?.id ?? foreignUnit.id })).status, 400);
    const updated = await api(owner, 'PATCH', `/api/products/${id}`, { name: `${marker}_UPDATED`, salesPrice: 175.75, isActive: false, categoryId: null, taxRateId: null });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.data.name, `${marker}_UPDATED`); assert.equal(Number(updated.body.data.salesPrice), 175.75); assert.equal(updated.body.data.isActive, false);
    const refreshed = await api(owner, 'GET', `/api/products/${id}`);
    assert.equal(refreshed.body.data.name, `${marker}_UPDATED`); assert.equal(refreshed.body.data.categoryId, null);
    assert.equal(await prisma.auditLog.count({ where: { tenantId: owner.tenantId, entityId: id, action: 'UPDATE' } }), 1);

    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { tenantId: owner.tenantId, isActive: true } });
    const movement = await api(owner, 'POST', '/api/stock/movements', { productId: id, type: 'OPENING', quantity: 7.5, warehouseId: warehouse.id, unitCost: 100.25, notes: marker, idempotencyKey: `${marker}_OPENING` });
    assert.equal(movement.status, 201, JSON.stringify(movement.body));
    assert.equal(Number((await prisma.stockLevel.findFirstOrThrow({ where: { tenantId: owner.tenantId, productId: id, warehouseId: warehouse.id } })).quantity), 7.5);
    assert.equal(Number((await prisma.product.findUniqueOrThrow({ where: { id } })).averageCost), 100.25);

    const headers = 'code,name,unitCode,barcode,salesPrice,purchasePrice,minStockLevel,categoryName,taxRateName,description,isActive';
    const importCode = `${marker}_CSV`;
    const csv = `${headers}\n${importCode},İçe Aktarım,${unit.code},,200,120,3,,,Türkçe açıklama,true`;
    const preview = await api(owner, 'POST', '/api/products/quick-import/preview', { csv });
    assert.equal(preview.status, 200); assert.equal(preview.body.data.summary.validRows, 1);
    const committed = await api(owner, 'POST', '/api/products/quick-import/commit', { csv });
    assert.equal(committed.status, 201); assert.equal(committed.body.data.createdCount, 1);
    const imported = await prisma.product.findUniqueOrThrow({ where: { tenantId_code: { tenantId: owner.tenantId, code: importCode } } }); ids.push(imported.id);
    const duplicatePreview = await api(owner, 'POST', '/api/products/quick-import/preview', { csv });
    assert.equal(duplicatePreview.body.data.summary.invalidRows, 1);
    const badCsv = `${headers}\n${marker}_BAD,Bad,NO_SUCH_UNIT,,-1,0,0,,,,maybe`;
    assert.equal((await api(owner, 'POST', '/api/products/quick-import/preview', { csv: badCsv })).body.data.summary.invalidRows, 1);
    const template = await api(owner, 'GET', '/api/products/quick-import/template');
    assert.equal(template.status, 200); assert.match(template.headers.get('content-type') ?? '', /text\/csv/); assert.match(String(template.body), /unitCode/);

    const removed = await api(owner, 'DELETE', `/api/products/${id}`); assert.equal(removed.status, 200);
    assert.equal((await api(owner, 'GET', `/api/products/${id}`)).status, 404);
    assert.equal((await api(owner, 'GET', `/api/products?search=${encodeURIComponent(marker)}`)).body.meta.total, 1);
    const deleted = await prisma.product.findUniqueOrThrow({ where: { id } }); assert.ok(deleted.deletedAt);
    assert.equal(await prisma.stockMovement.count({ where: { productId: id } }), 1);
    assert.equal(await prisma.stockLevel.count({ where: { productId: id } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { tenantId: owner.tenantId, entityId: id, action: 'DELETE' } }), 1);
    console.log('PASS products assurance (49 checks)');
  } finally {
    await prisma.stockMovement.deleteMany({ where: { productId: { in: ids } } });
    await prisma.stockLevel.deleteMany({ where: { productId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { tenantId: owner.tenantId, entityId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
