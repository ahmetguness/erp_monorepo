import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { ADMIN_PERMISSIONS } from '@repo/types';
import { prisma } from '../src/lib/prisma.js';
import { adminRoutes } from '../src/routes/admin.routes.js';
import { createAdminSession } from '../src/modules/platform/admin-auth/admin-session.service.js';
import { getTenant360 } from '../src/modules/platform/tenant-360/tenant-360.service.js';
import { addTenantSupportNote, supportNoteSchema } from '../src/modules/platform/tenant-360/tenant-support.service.js';

const suffix = `${Date.now()}-${process.pid}`;
const tenantIds: string[] = [];
const adminIds: string[] = [];
const userIds: string[] = [];
async function main(): Promise<void> {
  assert.equal(supportNoteSchema.safeParse({ body: '   ' }).success, false);
  assert.equal(supportNoteSchema.safeParse({ body: 'x'.repeat(4001) }).success, false);
  assert.equal(supportNoteSchema.safeParse({ body: 'Valid support note', authorId: 'spoof' }).success, false);
  for (const name of ['one', 'two']) {
    const tenant = await prisma.tenant.create({ data: { slug: `360-${name}-${suffix}`, companyName: `360 ${name}`, email: `${name}-${suffix}@test.local` } });
    tenantIds.push(tenant.id);
  }
  const tenantId = tenantIds[0]!;
  const otherId = tenantIds[1]!;
  for (const key of ['SUPER_ADMIN', 'SUPPORT', 'READ_ONLY_AUDITOR'] as const) {
    const role = await prisma.adminRole.findUniqueOrThrow({ where: { key } });
    const admin = await prisma.adminUser.create({ data: { name: key, email: `360-${key}-${suffix}@test.local`, password: 'unused', mfaEnabled: true, roleAssignments: { create: { adminRoleId: role.id } } } });
    adminIds.push(admin.id);
  }
  await addTenantSupportNote(tenantId, adminIds[0]!, { body: 'Only tenant one support note', ticketId: 'T-360' });
  await addTenantSupportNote(otherId, adminIds[0]!, { body: 'Other tenant private support note' });
  const snapshot = await getTenant360(tenantId, ADMIN_PERMISSIONS);
  assert.equal(snapshot.support.length, 1);
  assert.equal(snapshot.support[0]?.author.id, adminIds[0]);
  assert.equal(snapshot.changes?.[0]?.admin?.id, adminIds[0]);
  assert.equal(snapshot.usage.dailyActivity.length, 30);
  assert.equal(snapshot.usage.dailyActivity.reduce((sum, day) => sum + day.actions, 0), 0, 'Admin actions are not user activity');
  const user = await prisma.user.create({ data: { name: '360 User', email: `360-user-${suffix}@test.local`, password: 'unused' } });
  userIds.push(user.id);
  await prisma.tenantUser.create({ data: { tenantId, userId: user.id, isOwner: true } });
  await prisma.auditLog.create({ data: { tenantId, userId: user.id, module: 'TEST', action: 'UPDATE', entityType: 'OTHER', entityId: tenantId } });
  await prisma.auditLog.create({ data: { tenantId: otherId, userId: user.id, module: 'TEST', action: 'UPDATE', entityType: 'OTHER', entityId: otherId, createdAt: new Date(Date.now() + 60000) } });
  const integration = await prisma.marketplaceIntegration.create({ data: { tenantId, name: '360 integration', channel: 'OTHER', apiSecret: 'must-not-leak', syncErrors: 1 } });
  await prisma.marketplaceIntegration.create({ data: { tenantId: otherId, name: 'Other private integration', channel: 'OTHER' } });
  await prisma.marketplaceSyncJob.create({ data: { tenantId, integrationId: integration.id, jobType: 'SYNC_ORDERS', status: 'FAILED', errorMessage: 'must-not-leak', attempts: 2 } });
  await prisma.domainEventOutbox.create({ data: { tenantId, name: 'test.event', source: 'test', idempotencyKey: suffix, entityType: 'OTHER', entityId: tenantId, payload: {}, context: {}, status: 'DEAD_LETTER' } });
  const populated = await getTenant360(tenantId, ADMIN_PERMISSIONS);
  assert.equal(populated.health.status, 'ATTENTION');
  assert.equal(populated.integrations?.length, 1);
  assert.equal(populated.operations?.recentFailures.length, 2);
  assert.equal(populated.operations?.queue.reduce((sum, row) => sum + row.count, 0), 2);
  assert.equal(populated.usage.dailyActivity.reduce((sum, day) => sum + day.actions, 0), 1);
  assert.equal(populated.usage.dailyActivity.reduce((sum, day) => sum + day.users, 0), 1);
  assert.equal(populated.security?.members[0]?.id, user.id);
  assert.ok(populated.security?.members[0]?.lastTenantActivityAt);
  assert.ok(!JSON.stringify(populated).includes('must-not-leak'));
  await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
  assert.equal((await getTenant360(tenantId, ADMIN_PERMISSIONS)).security?.members[0]?.isActive, false, 'Disabled global users must not appear active');
  await prisma.user.update({ where: { id: user.id }, data: { isActive: true, deletedAt: new Date() } });
  assert.equal((await getTenant360(tenantId, ADMIN_PERMISSIONS)).security?.members[0]?.isActive, false, 'Deleted users must not appear active');
  await prisma.user.update({ where: { id: user.id }, data: { deletedAt: null } });
  const limited = await getTenant360(tenantId, ['tenant.read']);
  for (const section of ['operations', 'integrations', 'security', 'changes'] as const) assert.equal(limited[section], null);
  await assert.rejects(getTenant360(`missing-${suffix}`, ADMIN_PERMISSIONS));
  await prisma.tenant.update({ where: { id: otherId }, data: { deletedAt: new Date() } });
  await assert.rejects(getTenant360(otherId, ADMIN_PERMISSIONS));
  await assert.rejects(addTenantSupportNote(otherId, adminIds[0]!, { body: 'Deleted tenant must reject this note' }));
  assert.equal(await prisma.tenantSupportNote.count({ where: { tenantId: otherId } }), 1);
  const app = new Hono(); app.route('/api/admin', adminRoutes);
  assert.equal((await app.request(`/api/admin/tenants/${tenantId}/360`)).status, 401);
  const secret = process.env.ADMIN_JWT_SECRET;
  assert.ok(secret);
  for (const [index, adminId] of adminIds.entries()) {
    const admin = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    const session = await createAdminSession({ adminId, email: admin.email, tokenVersion: admin.tokenVersion, rememberMe: false, ipAddress: null, userAgent: 'tenant360-test', jwtSecret: secret });
    const headers = { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' };
    const response = await app.request(`/api/admin/tenants/${tenantId}/360`, { headers });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes('Other tenant private'));
    for (const sensitive of ['apiSecret', 'apiKey', 'password', 'mfaSecretEncrypted']) assert.ok(!text.includes(`"${sensitive}"`));
    const posted = await app.request(`/api/admin/tenants/${tenantId}/support-notes`, { method: 'POST', headers, body: JSON.stringify({ body: 'HTTP support note test' }) });
    assert.equal(posted.status, index === 2 ? 403 : 201);
    if (index !== 2) {
      const invalid = await app.request(`/api/admin/tenants/${tenantId}/support-notes`, { method: 'POST', headers, body: JSON.stringify({ body: 'short' }) });
      assert.equal(invalid.status, 400);
      await prisma.adminSession.updateMany({ where: { adminUserId: adminId }, data: { mfaVerifiedAt: new Date(0) } });
      const stale = await app.request(`/api/admin/tenants/${tenantId}/support-notes`, { method: 'POST', headers, body: JSON.stringify({ body: 'Must require fresh MFA' }) });
      assert.equal(stale.status, 403);
    }
  }
  console.log('Tenant 360 integration: OK (isolation, permissions, audit identity, notes, validation, MFA)');
}

main().finally(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
  await prisma.$disconnect();
}).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
