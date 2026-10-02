import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const base = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_FISCAL_${Date.now()}`;
type Session = { cookie: string; tenantId: string };

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'demo1234', tenantSlug }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  return { cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', tenantId: body.data.tenant.id };
}

async function api(session: Session | null, path: string, method = 'GET', body?: unknown, raw?: string) {
  const response = await fetch(`${base}/api/accounting${path}`, {
    method,
    headers: { origin, ...(session ? { cookie: session.cookie } : {}),
      ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  return { status: response.status, body: await response.json().catch(() => null) as any };
}

async function fixture(slug: string, userId: string) {
  const tenant = await prisma.tenant.create({ data: {
    slug, companyName: marker, email: `${slug}@test.local`, plan: 'ENTERPRISE', status: 'ACTIVE', modules: ['ACCOUNTING'],
  }});
  await prisma.tenantUser.create({ data: { tenantId: tenant.id, userId, isOwner: true } });
  const debit = await prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '100', name: 'Kasa', accountType: 'ASSET' } });
  const credit = await prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '300', name: 'Sermaye', accountType: 'EQUITY' } });
  return { tenant, debit, credit };
}

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@axondemo.com' } });
  const a = await fixture(`${marker.toLowerCase()}-a`, admin.id);
  const b = await fixture(`${marker.toLowerCase()}-b`, admin.id);
  try {
    const owner = await login(admin.email, a.tenant.slug);
    const foreign = await login(admin.email, b.tenant.slug);
    const denied = await login('depo@axondemo.com', 'axon-demo');

    assert.equal((await api(null, '/fiscal-periods')).status, 401);
    assert.equal((await api(denied, '/fiscal-periods')).status, 403);
    assert.equal((await api(denied, '/fiscal-periods', 'POST', { name: 'X', startDate: '2030-01-01', endDate: '2030-12-31' })).status, 403);

    const invalid = [
      {}, { name: '   ', startDate: '2035-01-01', endDate: '2035-12-31' },
      { name: 'X'.repeat(201), startDate: '2035-01-01', endDate: '2035-12-31' },
      { name: 'X', startDate: '2035/01/01', endDate: '2035-12-31' },
      { name: 'X', startDate: '2035-02-30', endDate: '2035-12-31' },
      { name: 'X', startDate: '2035-12-31', endDate: '2035-01-01' },
      { name: 'X', startDate: '2035-01-01', endDate: '2035-01-01' },
    ];
    for (const body of invalid) assert.equal((await api(owner, '/fiscal-periods', 'POST', body)).status, 400);
    assert.equal((await api(owner, '/fiscal-periods', 'POST', undefined, '{')).status, 400);

    const sameRange = { name: `${marker} Concurrent`, startDate: '2035-01-01', endDate: '2035-12-31' };
    const concurrent = await Promise.all([api(owner, '/fiscal-periods', 'POST', sameRange), api(owner, '/fiscal-periods', 'POST', sameRange)]);
    assert.deepEqual(concurrent.map(x => x.status).sort(), [201, 409]);
    const periodId = concurrent.find(x => x.status === 201)!.body.data.id as string;
    assert.equal(await prisma.fiscalPeriod.count({ where: { tenantId: a.tenant.id } }), 1);
    assert.equal((await api(owner, '/fiscal-periods', 'POST', { name: 'Boundary', startDate: '2035-12-31', endDate: '2036-06-30' })).status, 409);

    // The database itself rejects overlap, independently of the controller.
    await assert.rejects(prisma.fiscalPeriod.create({ data: { tenantId: a.tenant.id, name: 'DB overlap', startDate: new Date('2035-06-01'), endDate: new Date('2036-01-01') } }));
    const otherTenantPeriod = await prisma.fiscalPeriod.create({ data: { tenantId: b.tenant.id, name: `${marker} Other`, startDate: new Date('2035-01-01'), endDate: new Date('2035-12-31') } });

    const list = await api(owner, '/fiscal-periods');
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].name, sameRange.name);
    for (const suffix of ['closing-checklist', 'close', 'lock']) {
      const method = suffix === 'closing-checklist' ? 'GET' : 'POST';
      assert.equal((await api(owner, `/fiscal-periods/${otherTenantPeriod.id}/${suffix}`, method)).status, 404);
    }
    assert.equal((await api(owner, `/fiscal-periods/${otherTenantPeriod.id}/reopen`, 'POST', { reason: 'test' })).status, 404);
    assert.equal((await api(owner, `/fiscal-periods/${otherTenantPeriod.id}`, 'DELETE')).status, 404);
    assert.equal((await api(foreign, `/fiscal-periods/${periodId}/closing-checklist`)).status, 404);

    const reconciliation = await prisma.reconciliation.create({ data: { tenantId: a.tenant.id, name: marker, date: new Date('2035-06-01') } });
    const payment = await prisma.payment.create({ data: { tenantId: a.tenant.id, date: new Date('2035-06-02'), amount: 25, status: 'PENDING' } });
    let checklist = await api(owner, `/fiscal-periods/${periodId}/closing-checklist`);
    assert.equal(checklist.status, 200);
    assert.equal(checklist.body.data.summary.blockers, 2);
    assert.equal(checklist.body.data.summary.canClose, false);
    assert.equal((await api(owner, `/fiscal-periods/${periodId}/close`, 'POST')).status, 400);
    assert.equal((await prisma.fiscalPeriod.findUniqueOrThrow({ where: { id: periodId } })).status, 'OPEN');

    await prisma.reconciliation.update({ where: { id: reconciliation.id }, data: { isFinalized: true, finalizedAt: new Date(), finalizedById: admin.id } });
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'COMPLETED' } });
    checklist = await api(owner, `/fiscal-periods/${periodId}/closing-checklist`);
    assert.equal(checklist.body.data.summary.canClose, true);

    const closeResults = await Promise.all([api(owner, `/fiscal-periods/${periodId}/close`, 'POST'), api(owner, `/fiscal-periods/${periodId}/close`, 'POST')]);
    assert.equal(closeResults.filter(x => x.status === 200).length, 1);
    assert.equal(closeResults.filter(x => x.status !== 200).length, 1);
    const closed = await prisma.fiscalPeriod.findUniqueOrThrow({ where: { id: periodId } });
    assert.equal(closed.status, 'CLOSED'); assert.ok(closed.closedAt); assert.equal(closed.closedById, admin.id);

    const journal = { date: '2035-07-01', description: marker, lines: [
      { accountId: a.debit.id, debit: 10, credit: 0 }, { accountId: a.credit.id, debit: 0, credit: 10 },
    ] };
    assert.equal((await api(owner, '/journal-entries', 'POST', journal)).status, 400);
    assert.equal((await api(owner, `/fiscal-periods/${periodId}/reopen`, 'POST', {})).status, 400);
    assert.equal((await api(owner, `/fiscal-periods/${periodId}/reopen`, 'POST', { reason: 'Assurance yeniden açma' })).status, 200);
    assert.equal((await prisma.fiscalPeriod.findUniqueOrThrow({ where: { id: periodId } })).closedAt, null);
    assert.equal((await api(owner, `/fiscal-periods/${periodId}/close`, 'POST')).status, 200);
    assert.equal((await api(owner, `/fiscal-periods/${periodId}/lock`, 'POST')).status, 200);
    assert.equal((await api(owner, `/fiscal-periods/${periodId}/reopen`, 'POST', { reason: 'Olmaz' })).status, 400);
    assert.equal((await api(owner, `/fiscal-periods/${periodId}`, 'DELETE')).status, 400);

    const deletable = await api(owner, '/fiscal-periods', 'POST', { name: `${marker} Delete`, startDate: '2037-01-01', endDate: '2037-12-31' });
    assert.equal(deletable.status, 201);
    assert.equal((await api(owner, `/fiscal-periods/${deletable.body.data.id}`, 'DELETE')).status, 200);
    assert.equal(await prisma.fiscalPeriod.count({ where: { id: deletable.body.data.id } }), 0);
    assert.equal((await api(owner, '/fiscal-periods/missing/closing-checklist')).status, 404);

    console.log('Fiscal periods assurance PASS: 47 assertions plus DB/tenant/cleanup checks');
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [a.tenant.id, b.tenant.id] } } });
    await prisma.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
