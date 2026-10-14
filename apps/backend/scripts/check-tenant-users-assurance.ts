import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { FeatureKey, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const base = process.env.API_URL ?? 'http://localhost:3001';
const origin = 'http://localhost:3000';
const marker = `TEST_E2E_USERS_${Date.now()}`;
const password = 'Safe-Test-1234!';
type Session = { cookie: string };

async function request(path: string, method = 'GET', body?: unknown, session?: Session) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      origin,
      ...(session ? { cookie: session.cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function login(email: string, slug: string, loginPassword = password): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: loginPassword, tenantSlug: slug }),
  });
  assert.equal(response.status, 200, await response.text());
  return { cookie: response.headers.get('set-cookie')!.split(';')[0]! };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@axondemo.com' } });
  const tenantA = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-a`, companyName: `${marker}_A`, email: `${marker}-a@test.invalid`, plan: 'ENTERPRISE', status: 'ACTIVE', modules: [] } });
  const tenantB = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-b`, companyName: `${marker}_B`, email: `${marker}-b@test.invalid`, plan: 'ENTERPRISE', status: 'ACTIVE', modules: [] } });
  const emails = {
    direct: `${marker.toLowerCase()}-direct@test.invalid`,
    invited: `${marker.toLowerCase()}-invited@test.invalid`,
    foreign: `${marker.toLowerCase()}-foreign@test.invalid`,
    denied: `${marker.toLowerCase()}-denied@test.invalid`,
  };

  try {
    await prisma.tenantUser.createMany({ data: [
      { tenantId: tenantA.id, userId: owner.id, isOwner: true, isActive: true },
      { tenantId: tenantB.id, userId: owner.id, isOwner: true, isActive: true },
    ] });
    await prisma.tenantFeatureOverride.create({ data: { tenantId: tenantA.id, featureKey: FeatureKey.MAX_USERS, value: '5', isEnabled: true, reason: marker } });
    const roleA = await prisma.role.create({ data: { tenantId: tenantA.id, name: `${marker}_ROLE_A`, permissions: { create: [{ module: 'users', action: 'READ' }] } } });
    const roleB = await prisma.role.create({ data: { tenantId: tenantB.id, name: `${marker}_ROLE_B` } });
    const hash = await bcrypt.hash(password, 12);
    const [foreignUser, deniedUser] = await Promise.all([
      prisma.user.create({ data: { email: emails.foreign, name: `${marker} Foreign`, password: hash, tenants: { create: { tenantId: tenantB.id, roleId: roleB.id } } } }),
      prisma.user.create({ data: { email: emails.denied, name: `${marker} Denied`, password: hash, tenants: { create: { tenantId: tenantA.id } } } }),
    ]);

    assert.equal((await request('/api/users')).status, 401);
    const ownerSession = await login(owner.email, tenantA.slug, 'demo1234');
    const deniedSession = await login(deniedUser.email, tenantA.slug);
    assert.equal((await request('/api/users', 'GET', undefined, deniedSession)).status, 403);

    const created = await request('/api/users', 'POST', { email: emails.direct, name: `${marker} Türkçe Üye`, password, phone: '+90 555 111 2233', roleId: roleA.id }, ownerSession);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const directUserId = created.body.data.id as string;
    assert.equal(await prisma.tenantUser.count({ where: { tenantId: tenantA.id, userId: directUserId, roleId: roleA.id, isActive: true } }), 1);
    assert.equal((await request(`/api/users/${foreignUser.id}`, 'GET', undefined, ownerSession)).status, 404);
    assert.equal((await request(`/api/users/${directUserId}`, 'PATCH', { roleId: roleB.id }, ownerSession)).status, 400);
    assert.deepEqual(await prisma.tenantUser.findMany({ where: { userId: directUserId }, select: { tenantId: true } }), [{ tenantId: tenantA.id }]);
    const updated = await request(`/api/users/${directUserId}`, 'PATCH', { name: `${marker} Güncel`, roleId: null }, ownerSession);
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(await prisma.tenantUser.count({ where: { tenantId: tenantA.id, userId: directUserId, roleId: null } }), 1);
    await prisma.tenantUser.create({ data: { tenantId: tenantB.id, userId: directUserId, roleId: roleB.id } });
    assert.equal((await request(`/api/users/${directUserId}`, 'PATCH', { name: `${marker} Cross Tenant Mutation` }, ownerSession)).status, 400);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: directUserId } })).name, `${marker} Güncel`);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const invite = await prisma.invitation.create({ data: {
      tenantId: tenantA.id, email: emails.invited, roleId: roleA.id, invitedBy: owner.id,
      tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'), expiresAt: new Date(Date.now() + 3_600_000),
    } });
    const existingToken = crypto.randomBytes(32).toString('hex');
    await prisma.invitation.create({ data: {
      tenantId: tenantA.id, email: emails.foreign, roleId: roleA.id, invitedBy: owner.id,
      tokenHash: crypto.createHash('sha256').update(existingToken).digest('hex'), expiresAt: new Date(Date.now() + 3_600_000),
    } });

    const foreignRole = await request('/api/invitations', 'POST', { email: `${marker.toLowerCase()}-badrole@test.invalid`, roleId: roleB.id }, ownerSession);
    assert.equal(foreignRole.status, 409, JSON.stringify(foreignRole.body));
    assert.equal(await prisma.invitation.count({ where: { tenantId: tenantA.id, email: `${marker.toLowerCase()}-badrole@test.invalid` } }), 0);

    const overLimitInvite = await request('/api/invitations', 'POST', { email: `${marker.toLowerCase()}-over@test.invalid`, roleId: roleA.id }, ownerSession);
    assert.equal(overLimitInvite.status, 403, JSON.stringify(overLimitInvite.body));
    assert.equal((await request('/api/users', 'POST', { email: `${marker.toLowerCase()}-overuser@test.invalid`, name: 'Over', password }, ownerSession)).status, 403);

    const acceptBody = { token: rawToken, email: emails.invited, name: `${marker} Invited`, password };
    const accepts = await Promise.all([
      request('/api/public/invitations/accept', 'POST', acceptBody),
      request('/api/public/invitations/accept', 'POST', acceptBody),
    ]);
    assert.deepEqual(accepts.map((item) => item.status).sort(), [200, 400]);
    const acceptedUser = await prisma.user.findUniqueOrThrow({ where: { email: emails.invited } });
    assert.equal(await prisma.tenantUser.count({ where: { tenantId: tenantA.id, userId: acceptedUser.id, roleId: roleA.id, isActive: true } }), 1);
    assert.equal(await prisma.invitation.count({ where: { id: invite.id, status: 'ACCEPTED', acceptedAt: { not: null } } }), 1);
    const invitedSession = await login(emails.invited, tenantA.slug);
    assert.equal((await request('/api/users', 'GET', undefined, invitedSession)).status, 200);

    const originalForeign = await prisma.user.findUniqueOrThrow({ where: { id: foreignUser.id } });
    assert.equal((await request('/api/public/invitations/accept', 'POST', { token: existingToken, email: emails.foreign, name: 'ATTACKED NAME', password: 'Changed-Password-999!' })).status, 200);
    const afterExistingAccept = await prisma.user.findUniqueOrThrow({ where: { id: foreignUser.id } });
    assert.equal(afterExistingAccept.name, originalForeign.name);
    assert.equal(afterExistingAccept.password, originalForeign.password);
    assert.equal(await prisma.tenantUser.count({ where: { tenantId: tenantA.id, userId: foreignUser.id, roleId: roleA.id, isActive: true } }), 1);

    assert.equal((await request(`/api/users/${owner.id}`, 'DELETE', undefined, ownerSession)).status, 403);
    assert.equal((await request(`/api/users/${owner.id}`, 'PATCH', { isActive: false }, ownerSession)).status, 403);
    assert.equal((await request(`/api/users/${directUserId}`, 'DELETE', undefined, ownerSession)).status, 200);
    assert.equal(await prisma.tenantUser.count({ where: { tenantId: tenantA.id, userId: directUserId, isActive: false } }), 1);
    assert.ok(await prisma.auditLog.count({ where: { tenantId: tenantA.id, module: 'users', entityId: { in: [directUserId] } } }) >= 2);

    console.log(JSON.stringify({ marker, auth: 'PASS', crud: 'PASS', crossTenant: 'PASS', foreignRole: 'PASS', reservedCapacity: 'PASS', concurrentAcceptStatuses: accepts.map((item) => item.status).sort(), logicalMemberships: 1, audit: 'PASS' }, null, 2));
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    assert.equal(await prisma.tenant.count({ where: { companyName: { startsWith: marker } } }), 0);
    assert.equal(await prisma.user.count({ where: { email: { in: Object.values(emails) } } }), 0);
    await prisma.$disconnect();
  }
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
