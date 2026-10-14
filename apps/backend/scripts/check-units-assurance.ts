import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const base = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_UNITS_${Date.now()}`;
type Session = { cookie: string };

async function request(session: Session | null, path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'demo1234', tenantSlug }),
  });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie')!.split(';')[0]! };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@axondemo.com' } });
  const member = await prisma.user.findUniqueOrThrow({ where: { email: 'muhasebe@axondemo.com' } });
  const tenantA = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-a`, companyName: `${marker}_A`, email: `${marker}-a@example.test`, plan: 'ENTERPRISE', status: 'ACTIVE' } });
  const tenantB = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-b`, companyName: `${marker}_B`, email: `${marker}-b@example.test`, plan: 'ENTERPRISE', status: 'ACTIVE' } });
  try {
    await prisma.tenantUser.createMany({ data: [
      { tenantId: tenantA.id, userId: owner.id, isOwner: true },
      { tenantId: tenantA.id, userId: member.id },
      { tenantId: tenantB.id, userId: owner.id, isOwner: true },
    ] });
    const a = await login(owner.email, tenantA.slug);
    const unauthorized = await login(member.email, tenantA.slug);
    const b = await login(owner.email, tenantB.slug);

    assert.equal((await request(null, '/api/master/units')).status, 401);
    assert.equal((await request(unauthorized, '/api/master/units')).status, 403);
    assert.equal((await request(unauthorized, '/api/master/units', 'POST', { name: 'x', code: 'x' })).status, 403);

    for (const invalid of [
      {}, { name: ' ', code: 'X' }, { name: 'X', code: ' ' }, { name: 3, code: 'X' },
      { name: 'X'.repeat(101), code: 'X' }, { name: 'X', code: 'X'.repeat(11) },
    ]) assert.equal((await request(a, '/api/master/units', 'POST', invalid)).status, 400);

    const created = await request(a, '/api/master/units', 'POST', { name: '  Türkçe Ölçü  ', code: '  ölçü  ' });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.name, 'Türkçe Ölçü');
    assert.equal(created.body.data.code, 'ÖLÇÜ');
    assert.equal((await request(a, '/api/master/units', 'POST', { name: 'Duplicate', code: 'ÖLÇÜ' })).status, 409);

    const race = await Promise.all(Array.from({ length: 2 }, () => request(a, '/api/master/units', 'POST', { name: 'Race', code: 'RACE' })));
    assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
    assert.equal(await prisma.unit.count({ where: { tenantId: tenantA.id, code: 'RACE' } }), 1);

    const foreign = await request(b, '/api/master/units', 'POST', { name: 'Foreign', code: 'FOREIGN' });
    assert.equal(foreign.status, 201);
    const listA = await request(a, '/api/master/units');
    assert.equal(listA.status, 200);
    assert.equal(listA.body.data.some((u: { id: string }) => u.id === foreign.body.data.id), false);
    assert.equal((await request(a, `/api/master/units/${foreign.body.data.id}`, 'DELETE')).status, 404);
    assert.equal(await prisma.unit.count({ where: { id: foreign.body.data.id, tenantId: tenantB.id } }), 1);

    await prisma.product.create({ data: { tenantId: tenantA.id, unitId: created.body.data.id, code: `${marker}_PRODUCT`, name: `${marker}_PRODUCT` } });
    assert.equal((await request(a, `/api/master/units/${created.body.data.id}`, 'DELETE')).status, 400);
    assert.equal(await prisma.unit.count({ where: { id: created.body.data.id } }), 1);
    assert.equal(await prisma.product.count({ where: { tenantId: tenantA.id, unitId: created.body.data.id } }), 1);

    const historical = await request(a, '/api/master/units', 'POST', { name: 'Historical', code: 'HIST' });
    assert.equal(historical.status, 201);
    await prisma.product.create({ data: { tenantId: tenantA.id, unitId: historical.body.data.id, code: `${marker}_DELETED_PRODUCT`, name: `${marker}_DELETED_PRODUCT`, deletedAt: new Date() } });
    assert.equal((await request(a, `/api/master/units/${historical.body.data.id}`, 'DELETE')).status, 400);
    assert.equal(await prisma.unit.count({ where: { id: historical.body.data.id } }), 1);

    const disposable = await request(a, '/api/master/units', 'POST', { name: 'Disposable', code: 'DEL' });
    assert.equal(disposable.status, 201);
    assert.equal((await request(a, `/api/master/units/${disposable.body.data.id}`, 'DELETE')).status, 200);
    assert.equal(await prisma.unit.count({ where: { id: disposable.body.data.id } }), 0);

    const dbRows = await prisma.unit.findMany({ where: { tenantId: tenantA.id }, orderBy: { name: 'asc' } });
    const finalList = await request(a, '/api/master/units');
    assert.deepEqual(finalList.body.data.map((u: { id: string }) => u.id), dbRows.map((u) => u.id));
    console.log(JSON.stringify({ result: 'PASS', tenantAUnits: dbRows.length, concurrentStatuses: race.map((r) => r.status), tenantLeak: 0, usedUnitDeleteBlocked: true }, null, 2));
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
    assert.equal(await prisma.tenant.count({ where: { id: { in: [tenantA.id, tenantB.id] } } }), 0);
    await prisma.$disconnect();
  }
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
