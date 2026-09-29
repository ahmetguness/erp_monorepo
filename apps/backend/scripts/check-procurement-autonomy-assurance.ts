import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const baseUrl = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_PROC_AUTO_${Date.now()}`;
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
  const accounting = await login('muhasebe@axondemo.com', 'axon-demo');
  const settingKeys = ['procurement.planning.lookback_days', 'procurement.planning.horizon_days', 'procurement.planning.target_service_level', 'procurement.planning.auto_create_drafts', 'procurement.planning.maximum_draft_value'];
  const oldSettings = await prisma.tenantSetting.findMany({ where: { tenantId: owner.tenantId, key: { in: settingKeys } } });
  const ids: string[] = [];
  let supplierId = '';
  try {
    assert.equal((await api(null, 'GET', '/api/procurement-autonomy/planning-workspace')).status, 401);
    assert.equal((await api(accounting, 'GET', '/api/procurement-autonomy/planning-workspace')).status, 403);
    const unit = await prisma.unit.findFirstOrThrow({ where: { tenantId: owner.tenantId } });
    const supplier = await prisma.contact.create({ data: { tenantId: owner.tenantId, type: 'SUPPLIER', name: `${marker}_SUPPLIER`, code: `${marker}_S` } }); supplierId = supplier.id;
    const planProduct = await prisma.product.create({ data: { tenantId: owner.tenantId, unitId: unit.id, code: `${marker}_PLAN`, name: `${marker}_PLAN_PRODUCT`, purchasePrice: 10, minStockLevel: 12 } }); ids.push(planProduct.id);
    const legacyProduct = await prisma.product.create({ data: { tenantId: owner.tenantId, unitId: unit.id, code: `${marker}_LEGACY`, name: `${marker}_LEGACY_PRODUCT`, purchasePrice: 25, minStockLevel: 20 } }); ids.push(legacyProduct.id);
    for (const product of [planProduct, legacyProduct]) {
      await prisma.purchaseOrder.create({ data: { tenantId: owner.tenantId, contactId: supplier.id, number: `${marker}_HIST_${product.id.slice(-4)}`, date: new Date(Date.now() - 20 * 86400000), dueDate: new Date(Date.now() - 10 * 86400000), status: 'RECEIVED', totalNet: 100, totalGross: 100, items: { create: { tenantId: owner.tenantId, productId: product.id, quantity: 10, received: 10, unitPrice: product.id === planProduct.id ? 10 : 25, lineTotal: product.id === planProduct.id ? 100 : 250 } } } });
    }
    await prisma.stockMovement.create({ data: { tenantId: owner.tenantId, productId: planProduct.id, type: 'OUT', quantity: 30, idempotencyKey: `${marker}_MOVE` } });
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { tenantId: owner.tenantId } });
    const location = await prisma.location.findFirstOrThrow({ where: { tenantId: owner.tenantId, warehouseId: warehouse.id } });
    await prisma.stockLevel.create({ data: { tenantId: owner.tenantId, productId: legacyProduct.id, warehouseId: warehouse.id, locationId: location.id, quantity: 2 } });

    assert.equal((await api(owner, 'PUT', '/api/procurement-autonomy/planning-policy', {})).status, 400);
    assert.equal((await api(owner, 'PUT', '/api/procurement-autonomy/planning-policy', { lookbackDays: '90', horizonDays: 30, targetServiceLevel: 95, autoCreateDrafts: true, maximumDraftValue: 1000 })).status, 400);
    const policyResponse = await api(owner, 'PUT', '/api/procurement-autonomy/planning-policy', { lookbackDays: 1, horizonDays: 999, targetServiceLevel: 20, autoCreateDrafts: true, maximumDraftValue: 10_000_000 });
    assert.equal(policyResponse.status, 200); assert.deepEqual(policyResponse.body.data, { lookbackDays: 30, horizonDays: 120, targetServiceLevel: 85, autoCreateDrafts: true, maximumDraftValue: 10_000_000 });
    const stored = await prisma.tenantSetting.findFirstOrThrow({ where: { tenantId: owner.tenantId, key: 'procurement.planning.horizon_days' } }); assert.equal(stored.value, '120');
    assert.equal(await prisma.tenantSetting.count({ where: { tenantId: foreign.tenantId, key: { in: settingKeys } } }), 0);

    const workspace = await api(owner, 'GET', '/api/procurement-autonomy/planning-workspace'); assert.equal(workspace.status, 200);
    const recommendation = workspace.body.data.recommendations.find((row: any) => row.productId === planProduct.id); assert.ok(recommendation); assert.equal(recommendation.supplierId, supplier.id); assert.ok(recommendation.dailyDemand > 0); assert.ok(recommendation.scenarios.every((row: any) => row.quantity > 0 && row.estimatedCost === row.quantity * 10));
    const run = await api(owner, 'POST', '/api/procurement-autonomy/planning-run'); assert.equal(run.status, 200);
    const created = run.body.data.createdDrafts.find((row: any) => row.productId === planProduct.id); assert.ok(created);
    const planOrder = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: created.purchaseOrderId }, include: { items: true } }); assert.equal(planOrder.status, 'DRAFT'); assert.equal(planOrder.contactId, supplier.id); assert.equal(Number(planOrder.totalNet), Number(planOrder.items[0].lineTotal));
    const beforeRerun = await prisma.purchaseOrder.count({ where: { tenantId: owner.tenantId, items: { some: { productId: planProduct.id } }, status: { in: ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED'] } } });
    const rerun = await api(owner, 'POST', '/api/procurement-autonomy/planning-run'); assert.equal(rerun.status, 200); assert.equal(rerun.body.data.createdDrafts.some((row: any) => row.productId === planProduct.id), false);
    assert.equal(await prisma.purchaseOrder.count({ where: { tenantId: owner.tenantId, items: { some: { productId: planProduct.id } }, status: { in: ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED'] } } }), beforeRerun);

    const projections = await api(owner, 'GET', '/api/procurement-autonomy/projections'); assert.equal(projections.status, 200);
    const projected = projections.body.data.find((row: any) => row.productId === legacyProduct.id); assert.ok(projected); assert.equal(projected.onHandQty, 2); assert.equal(projected.incomingQty, 0); assert.equal(projected.dailyBurnRate, 0); assert.equal(projected.reorderStatus, 'REORDER_NEEDED');
    assert.equal((await api(owner, 'POST', '/api/procurement-autonomy/dispatch-po', {})).status, 400);
    assert.equal((await api(owner, 'POST', '/api/procurement-autonomy/dispatch-po', { productId: legacyProduct.id, autoDispatch: true })).status, 400);
    assert.ok([403, 404].includes((await api(foreign, 'POST', '/api/procurement-autonomy/dispatch-po', { productId: legacyProduct.id })).status));
    const concurrent = await Promise.all([api(owner, 'POST', '/api/procurement-autonomy/dispatch-po', { productId: legacyProduct.id, autoDispatch: false }), api(owner, 'POST', '/api/procurement-autonomy/dispatch-po', { productId: legacyProduct.id, autoDispatch: false })]);
    assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409]);
    const dispatched = concurrent.find(result => result.status === 200)!; assert.equal(dispatched.body.data.status, 'DRAFT'); assert.equal(dispatched.body.data.quantity, 18); assert.equal(dispatched.body.data.totalAmount, 450); assert.equal(dispatched.body.data.supplierName, supplier.name);
    const legacyOrder = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: dispatched.body.data.purchaseOrderId }, include: { items: true } }); assert.equal(legacyOrder.contactId, supplier.id); assert.equal(Number(legacyOrder.totalGross), 450); assert.equal(Number(legacyOrder.items[0].lineTotal), 450);
    const purchaseOrderDetail = await api(owner, 'GET', `/api/purchase-orders/${legacyOrder.id}`); assert.equal(purchaseOrderDetail.status, 200); assert.equal(purchaseOrderDetail.body.data.number, legacyOrder.number); assert.equal(purchaseOrderDetail.body.data.status, 'DRAFT');
    assert.equal((await api(owner, 'POST', '/api/procurement-autonomy/dispatch-po', { productId: legacyProduct.id })).status, 409);
    const refreshed = await api(owner, 'GET', '/api/procurement-autonomy/projections'); const refreshedProduct = refreshed.body.data.find((row: any) => row.productId === legacyProduct.id); assert.equal(refreshedProduct.incomingQty, 18); assert.equal(refreshedProduct.projectedStock, 20); assert.equal(refreshedProduct.reorderStatus, 'OK');
    const suppliers = await api(owner, 'GET', '/api/procurement-autonomy/suppliers'); assert.equal(suppliers.status, 200); assert.ok(suppliers.body.data.some((row: any) => row.supplierId === supplier.id));
    console.log('PASS procurement autonomy assurance: 31 assertions');
  } finally {
    await prisma.purchaseOrder.deleteMany({ where: { tenantId: owner.tenantId, OR: [{ number: { startsWith: marker } }, { items: { some: { productId: { in: ids } } } }] } });
    await prisma.stockMovement.deleteMany({ where: { tenantId: owner.tenantId, productId: { in: ids } } });
    await prisma.stockLevel.deleteMany({ where: { tenantId: owner.tenantId, productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    if (supplierId) await prisma.contact.deleteMany({ where: { id: supplierId } });
    await prisma.tenantSetting.deleteMany({ where: { tenantId: owner.tenantId, key: { in: settingKeys } } });
    if (oldSettings.length) await prisma.tenantSetting.createMany({ data: oldSettings.map(({ tenantId, key, value }) => ({ tenantId, key, value })) });
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
