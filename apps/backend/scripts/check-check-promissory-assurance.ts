import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const base = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_CHECK_NOTE_${Date.now()}`;
type Session = { cookie: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug }) });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie')!.split(';')[0] };
}
async function api(session: Session | null, path = '', method = 'GET', body?: unknown, raw?: string) {
  const response = await fetch(`${base}/api/check-promissory${path}`, { method, headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}) }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  return { status: response.status, body: await response.json().catch(() => null) as any };
}
async function cashflow(session: Session) {
  const response = await fetch(`${base}/api/reports/cashflow-forecast`, { headers: { origin, cookie: session.cookie } });
  return { status: response.status, body: await response.json() as any };
}
async function fixture(slug: string, userId: string) {
  const tenant = await prisma.tenant.create({ data: { slug, companyName: marker, email: `${slug}@test.local`, plan: 'ENTERPRISE', status: 'ACTIVE', modules: ['ACCOUNTING'] } });
  await prisma.tenantUser.create({ data: { tenantId: tenant.id, userId, isOwner: true } });
  const contact = await prisma.contact.create({ data: { tenantId: tenant.id, type: 'CUSTOMER', name: `${marker} Cari` } });
  return { tenant, contact };
}
const valid = (number: string, contactId?: string) => ({ contactId, type: 'CHECK', number, amount: 1250.25, currencyCode: 'try', issueDate: '2026-10-01', dueDate: '2026-11-01', bankName: ' Test Bankası ', notes: ' Türkçe test ' });

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@axondemo.com' } });
  const a = await fixture(`${marker.toLowerCase()}-a`, admin.id), b = await fixture(`${marker.toLowerCase()}-b`, admin.id);
  try {
    const sa = await login(admin.email, a.tenant.slug), sb = await login(admin.email, b.tenant.slug), denied = await login('depo@axondemo.com', 'axon-demo');
    assert.equal((await api(null)).status, 401);
    assert.equal((await api(denied)).status, 403);
    for (const path of ['?page=abc', '?page=0', '?limit=101', '?type=INVALID', '?status=INVALID']) assert.equal((await api(sa, path)).status, 400);
    const invalid = [{}, { ...valid(' '), number: ' ' }, { ...valid('BAD-ENUM'), type: 'OTHER' }, { ...valid('ZERO'), amount: 0 }, { ...valid('NEG'), amount: -1 }, { ...valid('DEC'), amount: 1.001 }, { ...valid('NAN'), amount: 'NaN' }, { ...valid('DATE'), dueDate: '2026-02-30' }, { ...valid('ORDER'), dueDate: '2026-09-30' }, { ...valid('CUR'), currencyCode: 'TL' }, { ...valid('LONG'), notes: 'x'.repeat(2001) }, { ...valid('EXTRA'), extra: true }];
    for (const body of invalid) assert.equal((await api(sa, '', 'POST', body)).status, 400);
    assert.equal((await api(sa, '', 'POST', undefined, '{')).status, 400);
    assert.equal((await api(sa, '', 'POST', valid(`${marker}-FOREIGN`, b.contact.id))).status, 400);

    const number = `${marker}-CONCURRENT`;
    const concurrent = await Promise.all([api(sa, '', 'POST', valid(number, a.contact.id)), api(sa, '', 'POST', valid(number, a.contact.id))]);
    assert.deepEqual(concurrent.map((item) => item.status).sort(), [201, 409]);
    const created = concurrent.find((item) => item.status === 201)!.body.data;
    assert.equal(await prisma.checkPromissoryNote.count({ where: { tenantId: a.tenant.id, number } }), 1);
    assert.equal(created.number, number); assert.equal(created.currencyCode, 'TRY'); assert.equal(created.bankName, 'Test Bankası'); assert.equal(Number(created.amount), 1250.25);
    assert.equal((await api(sb, '', 'POST', valid(number, b.contact.id))).status, 201);
    assert.equal((await api(sb, `?contactId=${a.contact.id}`)).body.data.length, 0);
    assert.equal((await api(sa, `/${created.id}`, 'PATCH', { amount: 0 })).status, 400);
    assert.equal((await api(sa, `/${created.id}`, 'PATCH', { dueDate: '2026-09-01' })).status, 400);
    assert.equal((await api(sa, `/${created.id}`, 'PATCH', { contactId: b.contact.id })).status, 400);
    assert.equal((await api(sa, `/${created.id}`, 'PATCH', {})).status, 400);
    const updated = await api(sa, `/${created.id}`, 'PATCH', { amount: 1500.5, dueDate: '2026-12-01', bankName: ' Yeni Banka ', notes: null });
    assert.equal(updated.status, 200); assert.equal(Number(updated.body.data.amount), 1500.5); assert.equal(updated.body.data.bankName, 'Yeni Banka'); assert.equal(updated.body.data.notes, null);
    const forecast = await cashflow(sa);
    assert.equal(forecast.status, 200);
    assert.equal(forecast.body.data.periods.reduce((sum: number, period: any) => sum + Number(period.inflow.checks), 0), 1500.5);
    assert.equal((await api(sb, `/${created.id}`, 'PATCH', { amount: 1 })).status, 404);
    assert.equal((await api(sb, `/${created.id}/status`, 'PATCH', { status: 'DEPOSITED' })).status, 404);
    assert.equal((await api(sb, `/${created.id}`, 'DELETE')).status, 404);

    const transitions = await Promise.all([api(sa, `/${created.id}/status`, 'PATCH', { status: 'DEPOSITED' }), api(sa, `/${created.id}/status`, 'PATCH', { status: 'CANCELLED' })]);
    assert.equal(transitions.filter((item) => item.status === 200).length, 1);
    assert.equal(transitions.every((item) => [200, 400, 409].includes(item.status)), true);
    const state = await prisma.checkPromissoryNote.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(['DEPOSITED', 'CANCELLED'].includes(state.status), true);
    assert.equal((await api(sa, `/${created.id}`, 'PATCH', { amount: 2 })).status, 400);
    assert.equal((await api(sa, `/${created.id}`, 'DELETE')).status, 400);

    const removable = await api(sa, '', 'POST', { ...valid(`${marker}-DELETE`), type: 'PROMISSORY_NOTE' });
    assert.equal(removable.status, 201);
    assert.equal((await api(sa, `/${removable.body.data.id}`, 'DELETE')).status, 200);
    assert.equal((await api(sa, `/${removable.body.data.id}`, 'DELETE')).status, 404);
    const deleted = await prisma.checkPromissoryNote.findUniqueOrThrow({ where: { id: removable.body.data.id } });
    assert.notEqual(deleted.deletedAt, null);
    const list = await api(sa, '?page=1&limit=1&type=CHECK');
    assert.equal(list.status, 200); assert.equal(list.body.meta.pageSize, 1); assert.equal(list.body.data.every((item: any) => item.type === 'CHECK'), true);

    await assert.rejects(prisma.checkPromissoryNote.create({ data: { tenantId: a.tenant.id, contactId: b.contact.id, type: 'CHECK', number: `${marker}-DB-FOREIGN`, amount: 1, issueDate: new Date('2026-10-01'), dueDate: new Date('2026-11-01') } }));
    await assert.rejects(prisma.checkPromissoryNote.create({ data: { tenantId: a.tenant.id, type: 'CHECK', number: `${marker}-DB-AMOUNT`, amount: 0, issueDate: new Date('2026-10-01'), dueDate: new Date('2026-11-01') } }));
    console.log(JSON.stringify({ status: 'PASS', crud: 'PASS', validation: invalid.length + 10, concurrentDuplicate: concurrent.map((item) => item.status), concurrentTransition: transitions.map((item) => item.status), tenantIsolation: 'PASS', databaseConstraints: 'PASS', cashflowChecksIn: 1500.5, softDelete: 'PASS' }));
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [a.tenant.id, b.tenant.id] } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
