import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const base = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_BANK_ACCOUNT_${Date.now()}`;
type Session = { cookie: string; tenantId: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug }) });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  return { cookie: response.headers.get('set-cookie')!.split(';')[0], tenantId: body.data.tenant.id };
}

async function api(session: Session | null, path: string, method = 'GET', body?: unknown, raw?: string) {
  const response = await fetch(`${base}/api/payments/bank-accounts${path}`, { method, headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}) }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  return { status: response.status, body: await response.json().catch(() => null) as any };
}

async function payment(session: Session, bankAccountId: string) {
  const response = await fetch(`${base}/api/payments`, { method: 'POST', headers: { origin, cookie: session.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ bankAccountId, date: '2026-09-15', amount: 125.5, method: 'BANK_TRANSFER', direction: 'RECEIVE', reference: marker }) });
  return { status: response.status, body: await response.json().catch(() => null) as any };
}

async function fixture(slug: string, userId: string) {
  const tenant = await prisma.tenant.create({ data: { slug, companyName: marker, email: `${slug}@test.local`, plan: 'ENTERPRISE', status: 'ACTIVE', modules: ['ACCOUNTING'] } });
  await prisma.tenantUser.create({ data: { tenantId: tenant.id, userId, isOwner: true } });
  return tenant;
}

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@axondemo.com' } });
  const a = await fixture(`${marker.toLowerCase()}-a`, admin.id);
  const b = await fixture(`${marker.toLowerCase()}-b`, admin.id);
  try {
    const sessionA = await login(admin.email, a.slug);
    const sessionB = await login(admin.email, b.slug);
    const denied = await login('depo@axondemo.com', 'axon-demo');
    assert.equal((await api(null, '')).status, 401);
    assert.equal((await api(denied, '')).status, 403);

    const invalidBodies = [{}, { name: '   ' }, { name: 'x'.repeat(201) }, { name: marker, iban: 'TR000000000000000000000001' }, { name: marker, currencyCode: 'TL' }, { name: marker, type: 'INVALID' }, { name: marker, unexpected: true }];
    for (const body of invalidBodies) assert.equal((await api(sessionA, '', 'POST', body)).status, 400);
    assert.equal((await api(sessionA, '', 'POST', undefined, '{')).status, 400);

    const formattedIban = 'tr33 0006 1005 1978 6457 8413 26';
    const sameIban = 'TR330006100519786457841326';
    const concurrent = await Promise.all([
      api(sessionA, '', 'POST', { name: `${marker} A`, iban: formattedIban, currencyCode: 'try' }),
      api(sessionA, '', 'POST', { name: `${marker} duplicate`, iban: sameIban, currencyCode: 'TRY' }),
    ]);
    assert.equal(concurrent.filter((result) => result.status === 201).length, 1);
    assert.equal(concurrent.filter((result) => result.status === 409).length, 1);
    const created = concurrent.find((result) => result.status === 201)!.body.data;
    assert.equal(created.iban, sameIban);
    assert.equal(created.currencyCode, 'TRY');
    assert.equal(await prisma.bankAccount.count({ where: { tenantId: a.id, iban: sameIban } }), 1);

    const foreignSameIban = await api(sessionB, '', 'POST', { name: `${marker} B`, iban: sameIban });
    assert.equal(foreignSameIban.status, 201);
    const listA = await api(sessionA, '');
    assert.equal(listA.status, 200);
    assert.equal(listA.body.data.some((row: any) => row.id === foreignSameIban.body.data.id), false);

    assert.equal((await api(sessionA, `/${created.id}`, 'PATCH', {})).status, 400);
    assert.equal((await api(sessionA, `/${created.id}`, 'PATCH', { name: '   ' })).status, 400);
    const updated = await api(sessionA, `/${created.id}`, 'PATCH', { name: ` ${marker} Updated `, bankName: ' Test Bank ', currencyCode: 'usd', type: 'SAVINGS' });
    assert.equal(updated.status, 200);
    assert.deepEqual({ name: updated.body.data.name, bankName: updated.body.data.bankName, currencyCode: updated.body.data.currencyCode, type: updated.body.data.type }, { name: `${marker} Updated`, bankName: 'Test Bank', currencyCode: 'USD', type: 'SAVINGS' });
    assert.equal((await api(sessionB, `/${created.id}`, 'PATCH', { name: marker })).status, 404);
    assert.equal((await api(sessionB, `/${created.id}`, 'DELETE')).status, 404);

    const paid = await payment(sessionA, created.id);
    assert.equal(paid.status, 201);
    assert.equal((await payment(sessionB, created.id)).status, 400);
    assert.equal((await api(sessionA, `/${created.id}`, 'DELETE')).status, 200);
    assert.equal((await api(sessionA, `/${created.id}`, 'DELETE')).status, 404);
    assert.equal((await api(sessionA, '')).body.data.some((row: any) => row.id === created.id), false);
    const dbAccount = await prisma.bankAccount.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(dbAccount.isActive, false);
    assert.notEqual(dbAccount.deletedAt, null);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: paid.body.data.id } })).bankAccountId, created.id);
    assert.equal((await payment(sessionA, created.id)).status, 400);

    const nullIbanResults = await Promise.all([
      api(sessionA, '', 'POST', { name: `${marker} No IBAN 1` }),
      api(sessionA, '', 'POST', { name: `${marker} No IBAN 2`, iban: ' ' }),
    ]);
    assert.deepEqual(nullIbanResults.map((result) => result.status), [201, 201]);
    assert.equal(await prisma.bankAccount.count({ where: { tenantId: a.id, iban: null, name: { startsWith: marker } } }), 2);

    console.log(JSON.stringify({ status: 'PASS', concurrentDuplicate: concurrent.map((result) => result.status), normalization: created.iban, tenantIsolation: 'PASS', softDeleteHistory: 'PASS', nullIbanConcurrency: nullIbanResults.map((result) => result.status) }));
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
