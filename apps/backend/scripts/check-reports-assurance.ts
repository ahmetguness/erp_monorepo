import assert from 'node:assert/strict';
import { PermissionAction, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const base = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_REPORTS_${Date.now()}`;
type Session = { cookie: string };

async function request(session: Session | null, method: string, path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, { method, headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function login(email: string, slug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug: slug }) });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie')!.split(';')[0] };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@axondemo.com' } });
  const reader = await prisma.user.findUniqueOrThrow({ where: { email: 'muhasebe@axondemo.com' } });
  const foreignUser = await prisma.user.findUniqueOrThrow({ where: { email: 'starter@axondemo.com' } });
  const createTenant = async (suffix: string) => prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-${suffix}`, companyName: `${marker}_${suffix}`, email: `${suffix}-${marker}@example.test`, plan: 'ENTERPRISE', status: 'ACTIVE', modules: ['REPORTING'] } });
  const tenantA = await createTenant('a');
  const tenantB = await createTenant('b');
  try {
    const role = await prisma.role.create({ data: { tenantId: tenantA.id, name: `${marker}_ROLE`, permissions: { create: [
      ...Object.values(PermissionAction).map((action) => ({ module: 'reporting', action })),
      { module: 'invoicing', action: PermissionAction.READ },
    ] } } });
    const foreignRole = await prisma.role.create({ data: { tenantId: tenantB.id, name: `${marker}_FOREIGN_ROLE` } });
    await prisma.tenantUser.createMany({ data: [
      { tenantId: tenantA.id, userId: owner.id, isOwner: true },
      { tenantId: tenantA.id, userId: reader.id, roleId: role.id },
      { tenantId: tenantB.id, userId: owner.id, isOwner: true },
      { tenantId: tenantB.id, userId: foreignUser.id, roleId: foreignRole.id },
    ] });
    const unitA = await prisma.unit.create({ data: { tenantId: tenantA.id, code: `${marker}_EA`, name: 'Adet' } });
    const unitB = await prisma.unit.create({ data: { tenantId: tenantB.id, code: `${marker}_EB`, name: 'Adet' } });
    const [contactReceivable, contactPayable, contactB] = await Promise.all([
      prisma.contact.create({ data: { tenantId: tenantA.id, type: 'CUSTOMER', name: `${marker}_ALACAK`, code: `${marker}_C1` } }),
      prisma.contact.create({ data: { tenantId: tenantA.id, type: 'SUPPLIER', name: `${marker}_BORC`, code: `${marker}_C2` } }),
      prisma.contact.create({ data: { tenantId: tenantB.id, type: 'CUSTOMER', name: `${marker}_FOREIGN`, code: `${marker}_CB` } }),
    ]);
    const [product, deletedProduct, productB] = await Promise.all([
      prisma.product.create({ data: { tenantId: tenantA.id, unitId: unitA.id, code: `${marker}_P`, name: `${marker}_ÜRÜN`, averageCost: 10, minStockLevel: 5 } }),
      prisma.product.create({ data: { tenantId: tenantA.id, unitId: unitA.id, code: `${marker}_PD`, name: `${marker}_SILINMIS`, averageCost: 99, minStockLevel: 500, deletedAt: new Date(), isActive: false } }),
      prisma.product.create({ data: { tenantId: tenantB.id, unitId: unitB.id, code: `${marker}_PB`, name: `${marker}_FOREIGN`, averageCost: 100 } }),
    ]);
    const [warehouseA, warehouseB] = await Promise.all([
      prisma.warehouse.create({ data: { tenantId: tenantA.id, code: `${marker}_WA`, name: `${marker}_Depo` } }),
      prisma.warehouse.create({ data: { tenantId: tenantB.id, code: `${marker}_WB`, name: `${marker}_Foreign` } }),
    ]);
    const [locationA, locationB] = await Promise.all([
      prisma.location.create({ data: { tenantId: tenantA.id, warehouseId: warehouseA.id, code: `${marker}_LA`, name: 'Ana Raf' } }),
      prisma.location.create({ data: { tenantId: tenantB.id, warehouseId: warehouseB.id, code: `${marker}_LB`, name: 'Foreign Raf' } }),
    ]);
    await prisma.stockLevel.createMany({ data: [
      { tenantId: tenantA.id, productId: product.id, warehouseId: warehouseA.id, locationId: locationA.id, quantity: 3 },
      { tenantId: tenantA.id, productId: deletedProduct.id, warehouseId: warehouseA.id, locationId: locationA.id, quantity: 100 },
      { tenantId: tenantB.id, productId: productB.id, warehouseId: warehouseB.id, locationId: locationB.id, quantity: 7 },
    ] });
    await prisma.accountEntry.createMany({ data: [
      { tenantId: tenantA.id, contactId: contactReceivable.id, date: new Date('2026-09-15T10:00:00Z'), debit: 300, balance: 300 },
      { tenantId: tenantA.id, contactId: contactPayable.id, date: new Date('2026-09-15T11:00:00Z'), credit: 80, balance: -80 },
    ] });
    const makeInvoice = async (number: string, type: 'SALES' | 'PURCHASE', gross: number, options: { status?: 'DRAFT' | 'CANCELLED'; deletedAt?: Date; tenantId?: string; contactId?: string; productId?: string } = {}) => {
      const tenantId = options.tenantId ?? tenantA.id;
      return prisma.invoice.create({ data: { tenantId, contactId: options.contactId ?? contactReceivable.id, type, status: options.status ?? 'DRAFT', number, date: new Date('2026-09-15T14:30:00Z'), totalNet: gross / 1.2, totalTax: gross - gross / 1.2, totalGross: gross, deletedAt: options.deletedAt, lines: { create: [{ tenantId, productId: options.productId ?? product.id, description: marker, quantity: 2, unitPrice: gross / 2, lineTotal: gross }] } } });
    };
    await makeInvoice(`${marker}_SALE`, 'SALES', 120);
    await makeInvoice(`${marker}_PURCHASE`, 'PURCHASE', 60);
    await makeInvoice(`${marker}_CANCEL`, 'SALES', 999, { status: 'CANCELLED' });
    await makeInvoice(`${marker}_DELETED`, 'SALES', 500, { deletedAt: new Date() });
    await makeInvoice(`${marker}_FOREIGN`, 'SALES', 700, { tenantId: tenantB.id, contactId: contactB.id, productId: productB.id });
    await prisma.payment.createMany({ data: [
      { tenantId: tenantA.id, contactId: contactReceivable.id, date: new Date('2026-09-15T16:00:00Z'), amount: 250, direction: 'RECEIVE', status: 'COMPLETED', reference: marker },
      { tenantId: tenantA.id, contactId: contactPayable.id, date: new Date('2026-09-15T17:00:00Z'), amount: 90, direction: 'PAY', status: 'COMPLETED', reference: marker },
    ] });

    const sa = await login(owner.email, tenantA.slug), sr = await login(reader.email, tenantA.slug), sb = await login(owner.email, tenantB.slug);
    assert.equal((await request(null, 'GET', '/api/reports/stock-summary')).status, 401);
    const registry = await request(sa, 'GET', '/api/reports/registry');
    assert.equal(registry.status, 200); assert.equal(registry.body.data.datasets.length, 4);
    const cashflow = await request(sa, 'GET', '/api/reports/cashflow-forecast');
    assert.equal(cashflow.status, 200); assert.ok(Array.isArray(cashflow.body.data.periods));
    const insights = await request(sa, 'GET', '/api/reports/decision-insights?dateFrom=2026-09-15&dateTo=2026-09-15');
    assert.equal(insights.status, 200);
    for (const endpoint of ['revenue-summary', 'expense-summary', 'top-products']) {
      for (const query of ['dateFrom=bad&dateTo=2026-09-15', 'dateFrom=2026-09-16&dateTo=2026-09-15', 'dateFrom=2026-09-15']) assert.equal((await request(sa, 'GET', `/api/reports/${endpoint}?${query}`)).status, 400);
    }
    assert.equal((await request(sa, 'GET', '/api/reports/collection-list?dateFrom=2026-09-15')).status, 400);
    const range = 'dateFrom=2026-09-15&dateTo=2026-09-15';
    const revenue = await request(sa, 'GET', `/api/reports/revenue-summary?${range}`);
    assert.equal(revenue.status, 200); assert.equal(revenue.body.data.invoiceCount, 1); assert.equal(revenue.body.data.totalGross, 120);
    const expense = await request(sa, 'GET', `/api/reports/expense-summary?${range}`);
    assert.equal(expense.body.data.invoiceCount, 1); assert.equal(expense.body.data.totalGross, 60);
    const stock = await request(sa, 'GET', '/api/reports/stock-summary');
    assert.equal(stock.body.data.summary.totalLines, 1); assert.equal(stock.body.data.summary.totalStockValue, 30); assert.equal(stock.body.data.summary.belowMinStockCount, 1);
    const balances = await request(sa, 'GET', '/api/reports/contact-balance');
    assert.equal(balances.body.data.summary.totalReceivable, 300); assert.equal(balances.body.data.summary.totalPayable, 80);
    const collections = await request(sa, 'GET', `/api/reports/collection-list?${range}`);
    assert.equal(collections.body.data.summary.count, 1); assert.equal(collections.body.data.summary.totalCollected, 250);
    const top = await request(sa, 'GET', `/api/reports/top-products?${range}&limit=1`);
    assert.equal(top.body.data.products.length, 1); assert.equal(top.body.data.products[0].quantity, 2); assert.equal(top.body.data.products[0].revenue, 120);
    const foreignRevenue = await request(sb, 'GET', `/api/reports/revenue-summary?${range}`);
    assert.equal(foreignRevenue.body.data.totalGross, 700);

    const config = { reportType: 'KPI', dataset: 'invoices', metric: 'salesRevenue', groupBy: null, dateRangePreset: 'CUSTOM', dateFrom: '2026-09-15', dateTo: '2026-09-15', chartType: 'number', pinnedToDashboard: true, scheduleEmail: { enabled: true, frequency: 'WEEKLY', recipients: ['reports@example.test'] } };
    const preview = await request(sa, 'POST', '/api/reports/kpi/preview', config);
    assert.equal(preview.status, 200); assert.equal(preview.body.data.value, 120);
    assert.equal((await request(sa, 'POST', '/api/reports/kpi/preview', { ...config, dateFrom: '2026-09-16', dateTo: '2026-09-15' })).status, 400);
    assert.equal((await request(sa, 'POST', '/api/reports/saved', { name: ' ', module: 'reporting' })).status, 400);
    assert.equal((await request(sa, 'POST', '/api/reports/saved', { name: marker, module: 'reporting', columns: 'bad' })).status, 400);
    assert.equal((await request(sa, 'POST', '/api/reports/saved', { name: marker, module: 'reporting', isShared: 'yes' })).status, 400);
    assert.equal((await request(sa, 'POST', '/api/reports/saved', { name: marker, module: 'reporting', sharedRoleIds: [foreignRole.id] })).status, 400);
    assert.equal((await request(sa, 'POST', '/api/reports/saved', { name: marker, module: 'reporting', sharedUserIds: [foreignUser.id] })).status, 400);
    assert.equal((await request(sa, 'POST', '/api/reports/saved', { name: marker, module: 'reporting', filters: { ...config, scheduleEmail: { ...config.scheduleEmail, recipients: ['invalid'] } } })).status, 400);
    const created = await request(sa, 'POST', '/api/reports/saved', { name: `${marker}<script>alert(1)</script>`, module: 'reporting', filters: config, columns: ['value'], isShared: true, pinnedToDashboard: true });
    assert.equal(created.status, 201);
    const reportId = created.body.data.id as string;
    assert.equal((await request(sr, 'GET', `/api/reports/saved/${reportId}`)).status, 200);
    assert.equal((await request(sr, 'PATCH', `/api/reports/saved/${reportId}`, { name: 'HIJACKED' })).status, 404);
    assert.equal((await request(sr, 'DELETE', `/api/reports/saved/${reportId}`)).status, 404);
    assert.equal((await request(sb, 'GET', `/api/reports/saved/${reportId}`)).status, 404);
    const dashboard = await request(sa, 'GET', '/api/reports/saved?dashboard=1');
    assert.equal(dashboard.body.data.length, 1);
    assert.equal((await request(sa, 'POST', `/api/reports/saved/${reportId}/export-audit`)).status, 200);
    assert.equal(await prisma.auditLog.count({ where: { tenantId: tenantA.id, entityId: reportId, action: 'EXPORT' } }), 1);
    const scheduled = await request(sa, 'POST', `/api/reports/saved/${reportId}/run-schedule`);
    assert.equal(scheduled.status, 200); assert.equal(scheduled.body.data.mailCount, 1); assert.equal(scheduled.body.data.notificationCount, 1);
    const scheduledMail = await prisma.mailMessage.findFirstOrThrow({ where: { tenantId: tenantA.id, subject: { contains: marker } } });
    assert.doesNotMatch(scheduledMail.html, /<script>/); assert.match(scheduledMail.html, /&lt;script&gt;/);
    const updated = await request(sa, 'PATCH', `/api/reports/saved/${reportId}`, { name: `${marker}_UPDATED`, pinnedToDashboard: false });
    assert.equal(updated.status, 200); assert.equal(updated.body.data.name, `${marker}_UPDATED`);
    assert.equal((await request(sa, 'DELETE', `/api/reports/saved/${reportId}`)).status, 200);
    assert.equal(await prisma.savedReport.count({ where: { tenantId: tenantA.id } }), 0);
    console.log('Reports assurance PASS: calculations, inclusive dates, soft-delete, KPI, saved CRUD/sharing, audit, mock schedule, XSS, auth and tenant isolation.');
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
    assert.equal(await prisma.tenant.count({ where: { companyName: { startsWith: marker } } }), 0);
    await prisma.$disconnect();
  }
}
main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
