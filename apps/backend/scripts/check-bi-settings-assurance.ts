import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const base = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_BI_${Date.now()}`;

async function json(path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { origin, ...(init.headers ?? {}) } });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function login(slug: string) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@axondemo.com', password: 'demo1234', tenantSlug: slug }),
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@axondemo.com' } });
  const tenantA = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-a`, companyName: `${marker}_A`, email: `${marker}-a@example.test`, plan: 'ENTERPRISE', status: 'ACTIVE' } });
  const tenantB = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-b`, companyName: `${marker}_B`, email: `${marker}-b@example.test`, plan: 'ENTERPRISE', status: 'ACTIVE' } });
  const starter = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-starter`, companyName: `${marker}_STARTER`, email: `${marker}-starter@example.test`, plan: 'STARTER', status: 'ACTIVE' } });
  try {
    await prisma.tenantUser.createMany({ data: [tenantA, tenantB, starter].map((tenant) => ({ tenantId: tenant.id, userId: owner.id, isOwner: true })) });
    const cookieA = await login(tenantA.slug);
    const cookieStarter = await login(starter.slug);
    assert.equal((await json('/api/settings/security/bi')).status, 401);
    assert.equal((await json('/api/settings/security/bi', { headers: { cookie: cookieStarter } })).status, 400);

    const invalid = await json('/api/settings/security/bi', { method: 'POST', headers: { cookie: cookieA, 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true, interval: 'hourly', entities: 'products,secret', connectorType: 'ftp', destinationName: '', readReplicaHost: '', warehouseProject: '', scheduledExportTarget: 'none', scheduledExportFormat: 'xml' }) });
    assert.equal(invalid.status, 400);
    assert.equal(await prisma.tenantSetting.count({ where: { tenantId: tenantA.id, key: { startsWith: 'bi.' } } }), 0);

    const saved = await json('/api/settings/security/bi', { method: 'POST', headers: { cookie: cookieA, 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true, interval: 'daily', entities: 'products,contacts', connectorType: 'rest', destinationName: '', readReplicaHost: '', warehouseProject: '', scheduledExportTarget: 'none', scheduledExportFormat: 'json' }) });
    assert.equal(saved.status, 200);
    await prisma.tenantSetting.upsert({ where: { tenantId_key: { tenantId: tenantA.id, key: 'security.bi.token' } }, create: { tenantId: tenantA.id, key: 'security.bi.token', value: 'bi_legacy_fixture' }, update: { value: 'bi_legacy_fixture' } });
    const legacyRead = await json('/api/settings/security/bi', { headers: { cookie: cookieA } });
    assert.equal(legacyRead.status, 200);
    assert.match((await prisma.tenantSetting.findUniqueOrThrow({ where: { tenantId_key: { tenantId: tenantA.id, key: 'security.bi.token' } } })).value, /^sha256:[a-f0-9]{64}$/);
    const generated = await json('/api/settings/security/bi/generate-token', { method: 'POST', headers: { cookie: cookieA } });
    assert.equal(generated.status, 200);
    const token = generated.body.data.token as string;
    const stored = await prisma.tenantSetting.findUniqueOrThrow({ where: { tenantId_key: { tenantId: tenantA.id, key: 'security.bi.token' } } });
    assert.match(stored.value, /^sha256:[a-f0-9]{64}$/);
    assert.notEqual(stored.value, token);
    const read = await json('/api/settings/security/bi', { headers: { cookie: cookieA } });
    assert.equal(read.status, 200);
    assert.equal(read.body.data.token, '');
    assert.equal(read.body.data.tokenConfigured, true);
    assert.equal(read.body.data.status.health, 'ready');

    const unitA = await prisma.unit.create({ data: { tenantId: tenantA.id, code: `${marker}_UA`, name: 'Adet' } });
    const unitB = await prisma.unit.create({ data: { tenantId: tenantB.id, code: `${marker}_UB`, name: 'Adet' } });
    const sameTime = new Date('2026-01-02T03:04:05.000Z');
    await prisma.product.createMany({ data: Array.from({ length: 7 }, (_, index) => ({ tenantId: tenantA.id, unitId: unitA.id, code: `${marker}_A_${index}`, name: `${marker} A ${index}`, updatedAt: sameTime })) });
    await prisma.product.create({ data: { tenantId: tenantB.id, unitId: unitB.id, code: `${marker}_B_SECRET`, name: `${marker}_B_SECRET`, updatedAt: sameTime } });

    assert.equal((await json(`/api/bi/v1/export/products`)).status, 401);
    assert.equal((await json(`/api/bi/v1/export/products?token=${token}&since=not-a-date`)).status, 400);
    assert.equal((await json(`/api/bi/v1/export/products?token=${token}&limit=0`)).status, 400);
    assert.equal((await json(`/api/bi/v1/export/products?token=${token}&cursor=broken`)).status, 400);
    const seen: string[] = [];
    let cursor = '';
    let firstTotal = 0;
    do {
      const page = await json(`/api/bi/v1/export/products?limit=3&token=${token}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      assert.equal(page.status, 200);
      firstTotal ||= page.body.totalEligible;
      assert.ok(page.body.data.every((item: { tenantId?: string; code: string }) => !item.code.includes('B_SECRET')));
      seen.push(...page.body.data.map((item: { id: string }) => item.id));
      cursor = page.body.nextCursor ?? '';
    } while (cursor);
    assert.equal(firstTotal, 7);
    assert.equal(seen.length, 7);
    assert.equal(new Set(seen).size, 7);
    assert.deepEqual(seen, [...seen].sort());

    const rotated = await json('/api/settings/security/bi/generate-token', { method: 'POST', headers: { cookie: cookieA } });
    assert.equal(rotated.status, 200);
    assert.equal((await json(`/api/bi/v1/export/products?token=${token}`)).status, 401);
    assert.equal((await json(`/api/bi/v1/export/products?token=${rotated.body.data.token}`)).status, 200);

    console.log(JSON.stringify({ authAndPlanGuard: 'PASS', strictValidationAndAtomicity: 'PASS', tokenHashRevealOnceAndRotation: 'PASS', tenantIsolation: 'PASS', cursorCompleteness: 'PASS', deterministicOrdering: 'PASS', eligible: 7, exported: seen.length }, null, 2));
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id, starter.id] } } });
    assert.equal(await prisma.tenant.count({ where: { companyName: { startsWith: marker } } }), 0);
    await prisma.$disconnect();
  }
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
