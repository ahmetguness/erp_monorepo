import { expect, test } from 'vitest';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { request } from '../support/http.js';
import { resolveAccessContext } from '../../../src/modules/identity/infrastructure/access-context.resolver.js';
import { runWithTenantScope } from '../../../src/lib/tenant-isolation-context.js';
import { createSecuritySession, revokeSecuritySession, touchSecuritySession } from '../../../src/services/security-hardening.service.js';
import { userAccessSnapshotSQL } from '../../../src/modules/identity/infrastructure/user-access-snapshot.query.js';

isolatedDatabase();

test('trial deadlines retain an explicit UTC instant through JSON and enforce the write cutoff', async () => {
  const { a } = await fixture(); const deadline = new Date(Date.now() + 60_000);
  await db.tenant.update({ where: { id: a.tenant.id }, data: { status: 'TRIAL', trialEndsAt: deadline } });
  const context = (await resolveAccessContext(db, a.owner.id, a.tenant.id)).context;
  expect(context?.tenant.trialEndsAt?.toISOString()).toBe(deadline.toISOString());
  const rows = await db.$queryRaw<unknown[]>(userAccessSnapshotSQL(a.owner.id, a.tenant.id, new Date()));
  const wire = z.object({ tenant: z.object({ trialEndsAt: z.string() }) }).parse(rows[0]);
  expect(wire.tenant.trialEndsAt).toMatch(/(?:Z|[+-]\d{2}:\d{2})$/);
  expect((await request('POST', '/api/contacts', a.identity, { code: 'TRIALCLOCK', name: 'Clock control', type: 'CUSTOMER' })).status).toBe(201);
  await db.tenant.update({ where: { id: a.tenant.id }, data: { trialEndsAt: new Date(Date.now() - 60_000) } });
  expect((await request('POST', '/api/contacts', a.identity, { code: 'TRIALBLOCK', name: 'Must be denied', type: 'CUSTOMER' })).status).toBe(403);
  expect(await db.contact.count({ where: { tenantId: a.tenant.id, code: 'TRIALBLOCK' } })).toBe(0);
});

test('access and session validation use two statements while revocation, expiry and foreign-tenant sessions stay denied', async () => {
  const { a, b } = await fixture(); const meta = { ipAddress: null, userAgent: 'phase81-auth-snapshot' };
  const session = await createSecuritySession(db, a.tenant.id, a.owner.id, meta);
  const observed = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] }); let statements = 0;
  observed.$on('query', () => statements++);
  const token = jwt.sign({ tenantId: a.tenant.id, userId: a.owner.id, sessionId: session.id }, process.env.JWT_SECRET ?? '', { expiresIn: '1h' });
  try {
    await observed.$connect(); statements = 0;
    expect((await resolveAccessContext(observed, a.owner.id, a.tenant.id)).context).not.toBeNull();
    expect(await touchSecuritySession(observed, a.tenant.id, session.id, a.owner.id)).toBe('ACTIVE');
    expect(statements).toBe(2);
    expect(await touchSecuritySession(observed, b.tenant.id, session.id, a.owner.id)).toBeNull();
    expect((await request('GET', '/api/products', { token })).status).toBe(200);
    await revokeSecuritySession(db, a.tenant.id, session.id, a.owner.id, meta);
    expect((await request('GET', '/api/products', { token })).status).toBe(401);
    const active = await createSecuritySession(db, a.tenant.id, a.owner.id, meta);
    await db.tenantSetting.update({ where: { tenantId_key: { tenantId: a.tenant.id, key: 'security.sessions' } },
      data: { value: JSON.stringify([{ ...active, createdAt: new Date(Date.now() - 2 * 86400_000).toISOString() }]) } });
    await db.tenantSetting.create({ data: { tenantId: a.tenant.id, key: 'security.session.max_age_days', value: '1' } });
    const expiredToken = jwt.sign({ tenantId: a.tenant.id, userId: a.owner.id, sessionId: active.id }, process.env.JWT_SECRET ?? '', { expiresIn: '1h' });
    expect((await request('GET', '/api/products', { token: expiredToken })).status).toBe(401);
  } finally { await observed.$disconnect(); }
});

test('access snapshot retains fresh roles, plan overrides, expiry and IP restrictions without a cache', async () => {
  const { a, role, user } = await fixture();
  const now = new Date();
  const initial = await resolveAccessContext(db, user.id, a.tenant.id, now);
  expect(initial.context?.membership.permissions).toEqual([{ module: 'contacts', action: 'READ' }]);
  expect(initial.context?.tenant.plan).toBe('ENTERPRISE');
  await db.tenantFeatureOverride.create({ data: { tenantId: a.tenant.id, featureKey: 'CHAT_ENABLED', value: 'false', expiresAt: new Date(now.getTime() + 60_000) } });
  await db.tenantSetting.createMany({ data: [
    { tenantId: a.tenant.id, key: 'security.ip_restriction.enabled', value: 'true' },
    { tenantId: a.tenant.id, key: 'security.ip_whitelist', value: '127.0.0.1,10.0.0.0/24' },
  ] });
  await db.rolePermission.deleteMany({ where: { roleId: role.id } });
  await db.tenant.update({ where: { id: a.tenant.id }, data: { plan: 'STARTER' } });
  const changed = await resolveAccessContext(db, user.id, a.tenant.id, now);
  expect(changed.queryCount).toBe(1);
  expect(changed.context?.membership.permissions).toEqual([]);
  expect(changed.context?.tenant.plan).toBe('STARTER');
  expect(changed.context?.features.get('CHAT_ENABLED')).toMatchObject({ isEnabled: false, source: 'override' });
  expect(changed.context?.security).toEqual({ ipRestrictionEnabled: true, ipWhitelist: ['127.0.0.1', '10.0.0.0/24'] });
  const expired = await resolveAccessContext(db, user.id, a.tenant.id, new Date(now.getTime() + 120_000));
  expect(expired.context?.features.get('CHAT_ENABLED')).toMatchObject({ isEnabled: true, source: 'plan' });
});

test('a role belonging to another tenant cannot grant permissions through the snapshot', async () => {
  const { a, b, user, limited } = await fixture();
  const foreign = await db.role.create({ data: { tenantId: b.tenant.id, name: 'Foreign role', permissions: { create: { module: 'contacts', action: 'CREATE' } } } });
  await db.tenantUser.update({ where: { tenantId_userId: { tenantId: a.tenant.id, userId: user.id } }, data: { roleId: foreign.id } });
  const result = await resolveAccessContext(db, user.id, a.tenant.id);
  expect(result.context?.membership.permissions).toEqual([]);
  expect((await request('POST', '/api/contacts', limited, { code: 'DENIED', name: 'Denied', type: 'CUSTOMER' })).status).toBe(403);
  expect(await db.contact.count({ where: { tenantId: a.tenant.id, code: 'DENIED' } })).toBe(0);
});

test.each(['membership', 'user', 'tenant'] as const)('snapshot rejects inactive/deleted %s and never crosses the tenant boundary', async (kind) => {
  const { a, b, user } = await fixture();
  expect((await resolveAccessContext(db, user.id, b.tenant.id)).context).toBeNull();
  await expect(runWithTenantScope(b.tenant.id, () => resolveAccessContext(db, user.id, a.tenant.id))).rejects.toThrow('Tenant isolation violation');
  expect((await resolveAccessContext(db, user.id, "' OR true --")).context).toBeNull();
  if (kind === 'membership') await db.tenantUser.update({ where: { tenantId_userId: { tenantId: a.tenant.id, userId: user.id } }, data: { isActive: false } });
  if (kind === 'user') await db.user.update({ where: { id: user.id }, data: { isActive: false } });
  if (kind === 'tenant') await db.tenant.update({ where: { id: a.tenant.id }, data: { deletedAt: new Date() } });
  expect((await resolveAccessContext(db, user.id, a.tenant.id)).context).toBeNull();
});
