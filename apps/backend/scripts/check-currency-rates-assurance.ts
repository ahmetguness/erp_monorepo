import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const base = process.env.API_URL ?? 'http://localhost:3001', origin = 'http://localhost:3000', marker = `TEST_E2E_CURRENCY_${Date.now()}`;
type Session = { cookie: string };
async function req(s: Session | null, method: string, path: string, body?: unknown) { const r = await fetch(`${base}${path}`, { method, headers: { origin, ...(s ? { cookie: s.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }); const t = await r.text(); return { status: r.status, body: t ? JSON.parse(t) : null }; }
async function login(slug: string) { const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@axondemo.com', password: 'demo1234', tenantSlug: slug }) }); assert.equal(r.status, 200); return { cookie: r.headers.get('set-cookie')!.split(';')[0] }; }
async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@axondemo.com' } });
  const reader = await prisma.user.findUniqueOrThrow({ where: { email: 'muhasebe@axondemo.com' } });
  const make = async (suffix: string) => { const tenant = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-${suffix}`, companyName: `${marker}_${suffix}`, email: `${suffix}-${marker}@example.test`, plan: 'ENTERPRISE', status: 'ACTIVE', modules: [] } }); await prisma.tenantUser.create({ data: { tenantId: tenant.id, userId: user.id, isOwner: true } }); return tenant; };
  const a = await make('a'), b = await make('b');
  try {
    const role = await prisma.role.create({ data: { tenantId: a.id, name: `${marker}_READ`, permissions: { create: { module: 'settings', action: 'READ' } } } });
    await prisma.tenantUser.create({ data: { tenantId: a.id, userId: reader.id, roleId: role.id } });
    const sa = await login(a.slug), sb = await login(b.slug);
    const readerLogin = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email: reader.email, password: 'demo1234', tenantSlug: a.slug }) });
    assert.equal(readerLogin.status, 200); const sr = { cookie: readerLogin.headers.get('set-cookie')!.split(';')[0] };
    assert.equal((await req(null, 'GET', '/api/currency-rates')).status, 401);
    assert.equal((await req(sr, 'GET', '/api/currency-rates')).status, 200);
    assert.equal((await req(sr, 'POST', '/api/currency-rates', { currencyCode: 'USD', rate: 30, date: '2026-10-05' })).status, 403);
    const invalids = [null, {}, { currencyCode: 'US', rate: 30, date: '2026-10-05' }, { currencyCode: 'USD1', rate: 30, date: '2026-10-05' }, { currencyCode: 'USD', rate: 0, date: '2026-10-05' }, { currencyCode: 'USD', rate: -1, date: '2026-10-05' }, { currencyCode: 'USD', rate: null, date: '2026-10-05' }, { currencyCode: 'USD', rate: 1e15, date: '2026-10-05' }, { currencyCode: 'USD', rate: 30, date: 'bad' }, { currencyCode: 'USD', rate: 30, date: '2026-02-30' }, { currencyCode: 'USD', rate: 30, date: '2026-10-05', source: 'TCMB' }];
    for (const body of invalids) assert.equal((await req(sa, 'POST', '/api/currency-rates', body)).status, 400);
    for (const query of ['currencyCode=X', 'dateFrom=bad', 'dateFrom=2026-10-06&dateTo=2026-10-05']) assert.equal((await req(sa, 'GET', `/api/currency-rates?${query}`)).status, 400);
    const payload = { currencyCode: ' usd ', rate: 30.1234564, date: '2026-10-05' };
    const created = await req(sa, 'POST', '/api/currency-rates', payload);
    assert.equal(created.status, 201); assert.equal(created.body.data.currencyCode, 'USD'); assert.equal(Number(created.body.data.rate), 30.123456);
    const concurrent = await Promise.all(Array.from({ length: 8 }, (_, i) => req(sa, 'POST', '/api/currency-rates', { currencyCode: 'EUR', rate: 40 + i, date: '2026-10-05' })));
    assert.ok(concurrent.every((x) => x.status === 201));
    assert.equal(await prisma.currencyRate.count({ where: { tenantId: a.id, currencyCode: 'EUR', date: new Date('2026-10-05') } }), 1);
    const dbUsd = await prisma.currencyRate.findUniqueOrThrow({ where: { tenantId_currencyCode_date: { tenantId: a.id, currencyCode: 'USD', date: new Date('2026-10-05') } } });
    assert.equal(dbUsd.source, 'MANUAL'); assert.equal(Number(dbUsd.rate), 30.123456);
    const list = await req(sa, 'GET', '/api/currency-rates?currencyCode=usd&dateFrom=2026-10-05&dateTo=2026-10-05');
    assert.equal(list.status, 200); assert.equal(list.body.data.length, 1); assert.equal(list.body.data[0].currencyCode, 'USD');
    assert.equal((await req(sb, 'GET', '/api/currency-rates?currencyCode=USD')).body.data.length, 0);
    await req(sb, 'POST', '/api/currency-rates', { currencyCode: 'USD', rate: 99, date: '2026-10-05' });
    assert.equal(Number((await req(sa, 'GET', '/api/currency-rates?currencyCode=USD')).body.data[0].rate), 30.123456);
    const updated = await req(sa, 'POST', '/api/currency-rates', { currencyCode: 'USD', rate: 31.5, date: '2026-10-05', source: 'MANUAL' });
    assert.equal(updated.status, 201); assert.equal(await prisma.currencyRate.count({ where: { tenantId: a.id, currencyCode: 'USD' } }), 1); assert.equal(Number(updated.body.data.rate), 31.5);
    const tcmb = await req(sa, 'GET', '/api/currency-rates/tcmb');
    assert.ok([200, 502].includes(tcmb.status));
    if (tcmb.status === 200) { assert.ok(Array.isArray(tcmb.body.data.currencies)); assert.ok(tcmb.body.data.currencies.every((x: any) => x.unit > 0 && x.forexBuying > 0)); }
    console.log(`Currency rates assurance PASS: validation, precision, concurrent upsert, filtering, tenant isolation and TCMB contract (${tcmb.status}).`);
  } finally { await prisma.tenant.deleteMany({ where: { id: { in: [a.id, b.id] } } }); assert.equal(await prisma.tenant.count({ where: { companyName: { startsWith: marker } } }), 0); await prisma.$disconnect(); }
}
main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
