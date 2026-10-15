import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const base = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_CURRENCIES_${Date.now()}`;
type Session = { cookie: string };
async function request(session: Session | null, path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${base}${path}`, { method, headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function login(email: string, tenantSlug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug }) });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie')!.split(';')[0]! };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@axondemo.com' } });
  const member = await prisma.user.findUniqueOrThrow({ where: { email: 'muhasebe@axondemo.com' } });
  const tenants = await Promise.all(['a', 'b'].map((suffix) => prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-${suffix}`, companyName: `${marker}_${suffix}`, email: `${marker}-${suffix}@example.test`, plan: 'ENTERPRISE', status: 'ACTIVE' } })));
  const [tenantA, tenantB] = tenants;
  try {
    await prisma.tenantUser.createMany({ data: [{ tenantId: tenantA.id, userId: owner.id, isOwner: true }, { tenantId: tenantA.id, userId: member.id }, { tenantId: tenantB.id, userId: owner.id, isOwner: true }] });
    const a = await login(owner.email, tenantA.slug); const b = await login(owner.email, tenantB.slug); const unauthorized = await login(member.email, tenantA.slug);
    assert.equal((await request(null, '/api/master/currencies')).status, 401);
    assert.equal((await request(unauthorized, '/api/master/currencies')).status, 403);
    assert.equal((await request(unauthorized, '/api/master/currencies', 'POST', { code: 'ABC', name: 'x', symbol: 'x' })).status, 403);
    for (const invalid of [{}, { code: 'US', name: 'x', symbol: '$' }, { code: '123', name: 'x', symbol: '$' }, { code: 'USD', name: ' ', symbol: '$' }, { code: 'USD', name: 'x', symbol: ' ' }, { code: 'USD', name: 'x', symbol: '123456' }, { code: 'USD', name: 'x', symbol: '$', defaultRate: 0 }, { code: 'USD', name: 'x', symbol: '$', defaultRate: -1 }, { code: 'USD', name: 'x', symbol: '$', defaultRate: 1.1234567 }, { code: 'USD', name: 'x', symbol: '$', defaultRate: '1' }, { code: 'USD', name: 'x', symbol: '$', isBase: 'yes' }, { code: 'USD', name: 'x', symbol: '$', isBase: true, defaultRate: 2 }]) {
      assert.equal((await request(a, '/api/master/currencies', 'POST', invalid)).status, 400);
    }
    const baseRace = await Promise.all([
      request(a, '/api/master/currencies', 'POST', { code: 'TRY', name: 'Türk Lirası', symbol: 'wrong', defaultRate: 1, isBase: true }),
      request(a, '/api/master/currencies', 'POST', { code: 'XBA', name: 'Base Alternative', symbol: 'B', defaultRate: 1, isBase: true }),
    ]);
    assert.deepEqual(baseRace.map((row) => row.status).sort(), [201, 409]);
    assert.equal(await prisma.currency.count({ where: { tenantId: tenantA.id, isBase: true } }), 1);
    const storedBase = await prisma.currency.findFirstOrThrow({ where: { tenantId: tenantA.id, isBase: true } });
    assert.equal(storedBase.defaultRate.toFixed(6), '1.000000');
    if (storedBase.code === 'TRY') assert.equal(storedBase.symbol, '₺');

    const duplicateRace = await Promise.all(Array.from({ length: 2 }, () => request(a, '/api/master/currencies', 'POST', { code: ' abc ', name: 'Test Döviz', symbol: '¤', defaultRate: 12.345678 })));
    assert.deepEqual(duplicateRace.map((row) => row.status).sort(), [201, 409]);
    assert.equal(await prisma.currency.count({ where: { tenantId: tenantA.id, code: 'ABC' } }), 1);
    const stored = await prisma.currency.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tenantA.id, code: 'ABC' } } });
    assert.equal(stored.name, 'Test Döviz'); assert.equal(stored.defaultRate.toFixed(6), '12.345678');

    const foreign = await request(b, '/api/master/currencies', 'POST', { code: 'ABC', name: 'Foreign', symbol: 'F', defaultRate: 2 });
    assert.equal(foreign.status, 201);
    const listedA = await request(a, '/api/master/currencies');
    assert.equal(listedA.status, 200); assert.equal(listedA.body.data.some((row: { id: string }) => row.id === foreign.body.data.id), false);
    assert.deepEqual(listedA.body.data.map((row: { code: string }) => row.code), [...listedA.body.data.map((row: { code: string }) => row.code)].sort());

    assert.equal((await request(a, '/api/currency-rates', 'POST', { currencyCode: 'ZZZ', rate: 5, date: '2026-10-15' })).status, 400);
    const manualRate = await request(a, '/api/currency-rates', 'POST', { currencyCode: 'ABC', rate: 13.25, date: '2026-10-15' });
    assert.equal(manualRate.status, 201); assert.equal(Number(manualRate.body.data.rate), 13.25);
    assert.equal(await prisma.currencyRate.count({ where: { tenantId: tenantA.id, currencyCode: 'ABC' } }), 1);
    if (storedBase.code === 'TRY') assert.equal((await request(a, '/api/currency-rates', 'POST', { currencyCode: 'TRY', rate: 2, date: '2026-10-15' })).status, 400);
    console.log(JSON.stringify({ result: 'PASS', concurrentBaseStatuses: baseRace.map((row) => row.status), concurrentDuplicateStatuses: duplicateRace.map((row) => row.status), baseCount: 1, tenantLeak: 0, manualRate: 13.25 }, null, 2));
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: tenants.map((tenant) => tenant.id) } } });
    assert.equal(await prisma.tenant.count({ where: { id: { in: tenants.map((tenant) => tenant.id) } } }), 0);
    await prisma.$disconnect();
  }
}
main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
