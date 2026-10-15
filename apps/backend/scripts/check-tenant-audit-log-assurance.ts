import assert from 'node:assert/strict';
import { AuditAction, EntityType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const base = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_TENANT_AUDIT_${Date.now()}`;
const LOG_COUNT = 10_005;

async function login(email: string, slug: string) {
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234', tenantSlug: slug }) });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

async function request(cookie: string | null, path: string) {
  const response = await fetch(`${base}${path}`, { headers: { origin, ...(cookie ? { cookie } : {}) } });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@axondemo.com' } });
  const restricted = await prisma.user.findUniqueOrThrow({ where: { email: 'muhasebe@axondemo.com' } });
  const tenantA = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-a`, companyName: `${marker}_A`, email: `${marker}-a@example.test`, plan: 'ENTERPRISE', status: 'ACTIVE' } });
  const tenantB = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-b`, companyName: `${marker}_B`, email: `${marker}-b@example.test`, plan: 'ENTERPRISE', status: 'ACTIVE' } });
  try {
    const role = await prisma.role.create({ data: { tenantId: tenantA.id, name: `${marker}_NO_AUDIT` } });
    await prisma.tenantUser.createMany({ data: [
      { tenantId: tenantA.id, userId: owner.id, isOwner: true },
      { tenantId: tenantB.id, userId: owner.id, isOwner: true },
      { tenantId: tenantA.id, userId: restricted.id, roleId: role.id },
    ] });
    const createdAt = new Date('2026-06-01T12:00:00.000Z');
    await prisma.auditLog.createMany({ data: Array.from({ length: LOG_COUNT }, (_, index) => ({ tenantId: tenantA.id, userId: owner.id, module: marker, entityType: EntityType.OTHER, entityId: `${marker}_${String(index).padStart(5, '0')}`, action: index % 2 ? AuditAction.UPDATE : AuditAction.DELETE, newValues: { index, name: `${marker} Türkçe` }, createdAt })) });
    await prisma.auditLog.create({ data: { tenantId: tenantB.id, userId: owner.id, module: marker, entityType: EntityType.OTHER, entityId: `${marker}_TENANT_B_SECRET`, action: AuditAction.DELETE, createdAt } });
    const ownerCookie = await login(owner.email, tenantA.slug);
    const restrictedCookie = await login(restricted.email, tenantA.slug);

    assert.equal((await request(null, '/api/audit-logs')).status, 401);
    assert.equal((await request(restrictedCookie, '/api/audit-logs')).status, 403);
    for (const query of ['page=x', 'limit=0', 'action=INVALID', 'entityType=INVALID', 'criticalOnly=yes', 'dateFrom=bad', 'dateFrom=2026-06-02&dateTo=2026-06-01']) {
      assert.equal((await request(ownerCookie, `/api/audit-logs?${query}`)).status, 400, query);
    }

    const first = await request(ownerCookie, `/api/audit-logs?module=${encodeURIComponent(marker)}&page=1&limit=100`);
    const second = await request(ownerCookie, `/api/audit-logs?module=${encodeURIComponent(marker)}&page=2&limit=100`);
    assert.equal(first.status, 200);
    assert.equal(first.body.meta.total, LOG_COUNT);
    const ids = [...first.body.data, ...second.body.data].map((row: { id: string }) => row.id);
    assert.equal(new Set(ids).size, 200);
    assert.deepEqual(ids, [...ids].sort().reverse());
    assert.ok(first.body.data.every((row: { tenantId: string; entityId: string }) => row.tenantId === tenantA.id && !row.entityId.includes('TENANT_B_SECRET')));

    const day = await request(ownerCookie, `/api/audit-logs?module=${encodeURIComponent(marker)}&dateFrom=2026-06-01&dateTo=2026-06-01&limit=1`);
    assert.equal(day.status, 200);
    assert.equal(day.body.meta.total, LOG_COUNT);
    const critical = await request(ownerCookie, `/api/audit-logs?module=${encodeURIComponent(marker)}&criticalOnly=true&limit=1`);
    assert.equal(critical.status, 200);
    assert.equal(critical.body.meta.total, Math.ceil(LOG_COUNT / 2));

    const exported = await request(ownerCookie, `/api/audit-logs/export?module=${encodeURIComponent(marker)}`);
    assert.equal(exported.status, 200);
    assert.equal(exported.body.data.length, 10_000);
    assert.equal(exported.body.meta.total, 10_000);
    assert.equal(exported.body.meta.totalEligible, LOG_COUNT);
    assert.equal(exported.body.meta.truncated, true);
    assert.equal(exported.body.meta.maxRows, 10_000);
    assert.equal(new Set(exported.body.data.map((row: { id: string }) => row.id)).size, 10_000);
    assert.ok(exported.body.data.every((row: { tenantId: string }) => row.tenantId === tenantA.id));

    const missing = await request(ownerCookie, '/api/audit-logs/not-found');
    assert.equal(missing.status, 404);
    console.log(JSON.stringify({ authPermission: 'PASS', tenantIsolation: 'PASS', validation: 'PASS', deterministicPagination: 'PASS', sameDayRange: 'PASS', criticalFilter: 'PASS', exportLimitDisclosure: 'PASS', eligible: LOG_COUNT, exported: 10_000, truncated: true }, null, 2));
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
    assert.equal(await prisma.tenant.count({ where: { companyName: { startsWith: marker } } }), 0);
    await prisma.$disconnect();
  }
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
