import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { expect, test } from 'vitest';
import { z } from 'zod';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { request } from '../support/http.js';
import { createSecuritySession, listSecuritySessions, revokeSecuritySession, touchSecuritySession } from '../../../src/services/security-hardening.service.js';

isolatedDatabase();
const meta = { ipAddress: null, userAgent: 'session-race-regression' };
const registrySchema = z.array(z.object({ id: z.string(), status: z.enum(['ACTIVE', 'REVOKED', 'EXPIRED']) }));

test('security: a stale unauthorized response does not clear a newer login cookie; explicit logout still clears it', async () => {
  const { a } = await fixture();
  const invalid = await request('GET', '/api/products', null, undefined, undefined, { Cookie: 'axon_token=invalid-old-token' });
  expect(invalid.status).toBe(401);
  expect(invalid.headers.has('set-cookie')).toBe(false);
  const session = await createSecuritySession(db, a.tenant.id, a.owner.id, meta);
  const token = jwt.sign({ tenantId: a.tenant.id, userId: a.owner.id, sessionId: session.id }, process.env.JWT_SECRET ?? '', { expiresIn: '1h' });
  await revokeSecuritySession(db, a.tenant.id, session.id, a.owner.id, meta);
  const revoked = await request('GET', '/api/products', null, undefined, undefined, { Cookie: `axon_token=${token}` });
  expect(revoked.status).toBe(401);
  expect(revoked.headers.has('set-cookie')).toBe(false);
  const logout = await request('POST', '/api/auth/logout', null, undefined, undefined, { Cookie: `axon_token=${token}` });
  expect(logout.status).toBe(200);
  expect(logout.headers.get('set-cookie')).toMatch(/axon_token=.*Max-Age=0/i);
});
test('security: concurrent logins retain every registry entry and enforce the session limit', async () => {
  const { a } = await fixture();
  await db.tenantSetting.create({ data: { tenantId: a.tenant.id, key: 'security.session.concurrent_limit', value: '1' } });
  const sessions = await Promise.all([1, 2, 3].map(() => createSecuritySession(db, a.tenant.id, a.owner.id, meta)));
  const record = await db.tenantSetting.findUniqueOrThrow({ where: { tenantId_key: { tenantId: a.tenant.id, key: 'security.sessions' } } });
  const stored = registrySchema.parse(JSON.parse(record.value));
  expect(stored.map((entry) => entry.id).sort()).toEqual(sessions.map((entry) => entry.id).sort());
  expect(stored.filter((entry) => entry.status === 'ACTIVE')).toHaveLength(1);
  for (const entry of stored) {
    const token = jwt.sign({ tenantId: a.tenant.id, userId: a.owner.id, sessionId: entry.id }, process.env.JWT_SECRET ?? '', { expiresIn: '1h' });
    expect((await request('GET', '/api/products', { token })).status).toBe(entry.status === 'ACTIVE' ? 200 : 401);
  }
});

test('security: an old touch snapshot cannot resurrect a revoked session', async () => {
  const { a } = await fixture();
  const session = await createSecuritySession(db, a.tenant.id, a.owner.id, meta);
  await db.tenantSetting.update({ where: { tenantId_key: { tenantId: a.tenant.id, key: 'security.sessions' } },
    data: { value: JSON.stringify([{ ...session, lastSeenAt: new Date(Date.now() - 10 * 60_000).toISOString() }]) } });
  // Pause the real revoke UPDATE after it has locked its row, allowing touch to read the old MVCC snapshot.
  await db.$executeRawUnsafe(`CREATE FUNCTION phase5_pause_revoke() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW."key" = 'security.sessions' AND NEW."value" LIKE '%"status":"REVOKED"%' THEN
      PERFORM pg_advisory_xact_lock(60451, 1); END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER phase5_pause_revoke BEFORE UPDATE ON tenant_settings FOR EACH ROW EXECUTE FUNCTION phase5_pause_revoke()');
  let revoke: Promise<unknown> | undefined;
  let touch: Promise<unknown> | undefined;
  async function waitForBlockedWriters(minimum: number): Promise<void> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const [row] = await db.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND (query LIKE '%tenant_settings%' OR query LIKE '%pg_advisory_xact_lock%')`;
      if ((row?.count ?? 0) >= minimum) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Expected session writers to reach the controlled database lock.');
  }
  try {
    await db.$transaction(async (gate) => {
      await gate.$executeRaw`SELECT pg_advisory_xact_lock(60451, 1)`;
      revoke = revokeSecuritySession(db, a.tenant.id, session.id, a.owner.id, meta);
      await waitForBlockedWriters(1);
      touch = touchSecuritySession(db, a.tenant.id, session.id, a.owner.id);
      await waitForBlockedWriters(2);
    }, { timeout: 15000 });
    await revoke;
    expect(await touch).toBe('REVOKED');
    const record = await db.tenantSetting.findUniqueOrThrow({ where: { tenantId_key: { tenantId: a.tenant.id, key: 'security.sessions' } } });
    expect(registrySchema.parse(JSON.parse(record.value))).toEqual([{ id: session.id, status: 'REVOKED' }]);
    await revokeSecuritySession(db, a.tenant.id, session.id, a.owner.id, meta);
    expect(await db.auditLog.count({ where: { tenantId: a.tenant.id, entityId: session.id, action: 'UPDATE' } })).toBe(1);
  } finally {
    await Promise.allSettled([revoke, touch]);
    await db.$executeRawUnsafe('DROP TRIGGER phase5_pause_revoke ON tenant_settings');
    await db.$executeRawUnsafe('DROP FUNCTION phase5_pause_revoke()');
  }
});

test('security: listing sessions is read-only and cannot overwrite the registry', async () => {
  const { a } = await fixture();
  await createSecuritySession(db, a.tenant.id, a.owner.id, meta);
  const observed = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
  const statements: string[] = [];
  observed.$on('query', (event) => { statements.push(event.query); });
  try {
    expect(await listSecuritySessions(observed, a.tenant.id)).toHaveLength(1);
    expect(statements.some((query) => /\b(?:UPDATE|INSERT|DELETE)\b/iu.test(query))).toBe(false);
  } finally { await observed.$disconnect(); }
});

