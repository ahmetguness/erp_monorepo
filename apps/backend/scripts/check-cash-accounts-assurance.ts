import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const base = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_CASH_ACCOUNT_${Date.now()}`;
type Session = { cookie: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug }) });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie')!.split(';')[0] };
}
async function api(session: Session | null, path: string, method = 'GET', body?: unknown, raw?: string) {
  const response = await fetch(`${base}/api/payments/cash-accounts${path}`, { method, headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}) }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  return { status: response.status, body: await response.json().catch(() => null) as any };
}
async function payment(session: Session, cashAccountId: string) {
  const response = await fetch(`${base}/api/payments`, { method: 'POST', headers: { origin, cookie: session.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ cashAccountId, date: '2026-09-15', amount: 125.5, method: 'CASH', direction: 'RECEIVE', reference: marker }) });
  return { status: response.status, body: await response.json().catch(() => null) as any };
}
async function fixture(slug: string, userId: string) {
  const tenant = await prisma.tenant.create({ data: { slug, companyName: marker, email: `${slug}@test.local`, plan: 'ENTERPRISE', status: 'ACTIVE', modules: ['ACCOUNTING'] } });
  await prisma.tenantUser.create({ data: { tenantId: tenant.id, userId, isOwner: true } });
  return tenant;
}

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@axondemo.com' } });
  const a = await fixture(`${marker.toLowerCase()}-a`, admin.id), b = await fixture(`${marker.toLowerCase()}-b`, admin.id);
  try {
    const sessionA = await login(admin.email, a.slug), sessionB = await login(admin.email, b.slug), denied = await login('depo@axondemo.com', 'axon-demo');
    assert.equal((await api(null, '')).status, 401);
    assert.equal((await api(denied, '')).status, 403);
    for (const body of [{}, { name: '   ' }, { name: 'x'.repeat(201) }, { name: marker, currencyCode: 'TL' }, { name: marker, currencyCode: '123' }, { name: marker, unexpected: true }]) assert.equal((await api(sessionA, '', 'POST', body)).status, 400);
    assert.equal((await api(sessionA, '', 'POST', undefined, '{')).status, 400);

    const createdResponse = await api(sessionA, '', 'POST', { name: ` ${marker} Türkçe Kasa ₺ `, currencyCode: 'try' });
    assert.equal(createdResponse.status, 201);
    const created = createdResponse.body.data;
    assert.equal(created.name, `${marker} Türkçe Kasa ₺`);
    assert.equal(created.currencyCode, 'TRY');
    const stored = await prisma.cashAccount.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(stored.name, created.name);

    const foreign = await api(sessionB, '', 'POST', { name: `${marker} Foreign`, currencyCode: 'EUR' });
    assert.equal(foreign.status, 201);
    const listA = await api(sessionA, '');
    assert.equal(listA.status, 200);
    assert.equal(listA.body.data.some((row: any) => row.id === foreign.body.data.id), false);
    assert.equal((await api(sessionA, `/${created.id}`, 'PATCH', {})).status, 400);
    assert.equal((await api(sessionA, `/${created.id}`, 'PATCH', { name: ' ' })).status, 400);
    const updated = await api(sessionA, `/${created.id}`, 'PATCH', { name: ` ${marker} Updated `, currencyCode: 'usd' });
    assert.equal(updated.status, 200);
    assert.deepEqual({ name: updated.body.data.name, currencyCode: updated.body.data.currencyCode }, { name: `${marker} Updated`, currencyCode: 'USD' });
    assert.equal((await api(sessionB, `/${created.id}`, 'PATCH', { name: marker })).status, 404);
    assert.equal((await api(sessionB, `/${created.id}`, 'DELETE')).status, 404);

    const paid = await payment(sessionA, created.id);
    assert.equal(paid.status, 201);
    assert.equal((await payment(sessionB, created.id)).status, 400);
    assert.equal((await api(sessionA, `/${created.id}`, 'DELETE')).status, 200);
    assert.equal((await api(sessionA, `/${created.id}`, 'DELETE')).status, 404);
    assert.equal((await api(sessionA, '')).body.data.some((row: any) => row.id === created.id), false);
    const deleted = await prisma.cashAccount.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(deleted.isActive, false);
    assert.notEqual(deleted.deletedAt, null);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: paid.body.data.id } })).cashAccountId, created.id);
    assert.equal((await payment(sessionA, created.id)).status, 400);

    const concurrent = await Promise.all([api(sessionA, '', 'POST', { name: `${marker} Concurrent`, currencyCode: 'TRY' }), api(sessionA, '', 'POST', { name: `${marker} Concurrent`, currencyCode: 'TRY' })]);
    assert.deepEqual(concurrent.map((result) => result.status), [201, 201]);
    assert.equal(await prisma.cashAccount.count({ where: { tenantId: a.id, name: `${marker} Concurrent` } }), 2);
    console.log(JSON.stringify({ status: 'PASS', validation: 'PASS', tenantIsolation: 'PASS', softDeleteHistory: 'PASS', concurrentDuplicateNames: concurrent.map((result) => result.status), duplicateNameDomainRule: 'ALLOWED' }));
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
