import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { prisma } from '../src/lib/prisma.js';
import { adminRoutes } from '../src/routes/admin.routes.js';
import { createAdminSession, rotateAdminSession } from '../src/modules/platform/admin-auth/admin-session.service.js';
import { acceptManagedAdminInvitation, inviteManagedAdmin } from '../src/modules/platform/admin-users/admin-invitation.service.js';
import { AdminUserError, assertSuperAdminPreserved, changeManagedAdmin, listManagedAdmins, revokeManagedAdminSessions } from '../src/modules/platform/admin-users/admin-user.service.js';

const suffix = `${Date.now()}-${process.pid}`;
const adminIds: string[] = [];
const invitedEmail = `invite-${suffix}@test.local`;
const failedEmail = `failed-invite-${suffix}@test.local`;

async function main(): Promise<void> {
  assert.throws(() => assertSuperAdminPreserved(true, false, 1), AdminUserError);
  assert.doesNotThrow(() => assertSuperAdminPreserved(true, true, 1));
  assert.doesNotThrow(() => assertSuperAdminPreserved(true, false, 2));
  const secret = process.env.ADMIN_JWT_SECRET;
  assert.ok(secret);
  const superRole = await prisma.adminRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
  const supportRole = await prisma.adminRole.findUniqueOrThrow({ where: { key: 'SUPPORT' } });
  const manager = await prisma.adminUser.create({ data: {
    name: 'Management Test', email: `manager-${suffix}@test.local`, password: 'not-used', mfaEnabled: true,
    roleAssignments: { create: { adminRoleId: superRole.id } },
  } });
  adminIds.push(manager.id);
  const support = await prisma.adminUser.create({ data: {
    name: 'Support Test', email: `support-${suffix}@test.local`, password: 'not-used', mfaEnabled: true,
    roleAssignments: { create: { adminRoleId: supportRole.id } },
  } });
  adminIds.push(support.id);
  let invitationUrl = '';
  await inviteManagedAdmin(manager.id, { name: 'Invited Admin', email: invitedEmail, roles: ['SUPPORT'] }, async (_, url) => { invitationUrl = url; return true; });
  const invited = await prisma.adminUser.findUniqueOrThrow({ where: { email: invitedEmail } });
  const token = new URL(invitationUrl).hash.slice(1);
  assert.ok(token && invited.inviteTokenHash !== token, 'Invitation token must be stored as a hash');
  assert.equal(invited.isActive, false);
  await changeManagedAdmin(manager.id, invited.id, { isActive: false, roles: ['READ_ONLY_AUDITOR'] });
  const editedInvitation = await prisma.adminUser.findUniqueOrThrow({ where: { id: invited.id } });
  assert.equal(editedInvitation.inviteTokenHash, invited.inviteTokenHash, 'Editing pending invitation roles must preserve its acceptance link');
  await assert.rejects(changeManagedAdmin(manager.id, invited.id, { isActive: true, roles: ['SUPPORT'] }), AdminUserError);
  await acceptManagedAdminInvitation(token, 'A-long-test-password-123!');
  await assert.rejects(acceptManagedAdminInvitation(token, 'A-long-test-password-123!'), AdminUserError);
  const accepted = await prisma.adminUser.findUniqueOrThrow({ where: { id: invited.id } });
  assert.equal(accepted.isActive, true);
  assert.equal(accepted.mfaEnabled, false, 'Invite acceptance must not bypass MFA');
  assert.equal(accepted.inviteTokenHash, null);
  await assert.rejects(inviteManagedAdmin(support.id, { name: 'No Access', email: failedEmail, roles: ['SUPER_ADMIN'] }, async () => true), AdminUserError);
  await assert.rejects(inviteManagedAdmin(manager.id, { name: 'Failed delivery', email: failedEmail, roles: ['SUPPORT'] }, async () => false), AdminUserError);
  assert.equal((await prisma.adminUser.findUniqueOrThrow({ where: { email: failedEmail } })).inviteTokenHash, null);
  let retriedUrl = '';
  await inviteManagedAdmin(manager.id, { name: 'Retry delivery', email: failedEmail, roles: ['SUPPORT'] }, async (_, url) => { retriedUrl = url; return true; });
  const expiredToken = new URL(retriedUrl).hash.slice(1);
  await prisma.adminUser.update({ where: { email: failedEmail }, data: { invitationExpiresAt: new Date(Date.now() - 1000) } });
  await assert.rejects(acceptManagedAdminInvitation(expiredToken, 'A-long-test-password-123!'), AdminUserError);
  await inviteManagedAdmin(manager.id, { name: 'Retry delivery', email: failedEmail, roles: ['SUPPORT'] }, async (_, url) => { retriedUrl = url; return true; });
  await assert.rejects(acceptManagedAdminInvitation(expiredToken, 'A-long-test-password-123!'), AdminUserError);
  const renewedToken = new URL(retriedUrl).hash.slice(1);
  const concurrentAccepts = await Promise.allSettled([
    acceptManagedAdminInvitation(renewedToken, 'A-long-test-password-123!'),
    acceptManagedAdminInvitation(renewedToken, 'A-long-test-password-123!'),
  ]);
  assert.equal(concurrentAccepts.filter((result) => result.status === 'fulfilled').length, 1, 'Only one concurrent invitation acceptance may succeed');
  await assert.rejects(acceptManagedAdminInvitation(randomBytes(32).toString('base64url'), 'A-long-test-password-123!'), AdminUserError);

  const sessionInput = { adminId: support.id, email: support.email, tokenVersion: support.tokenVersion, rememberMe: false, ipAddress: null, userAgent: 'test', jwtSecret: secret };
  const session = await createAdminSession(sessionInput);
  const app = new Hono(); app.route('/api/admin', adminRoutes);
  const supportHeaders = { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' };
  assert.equal((await app.request('/api/admin/admin-users', { headers: supportHeaders })).status, 403);
  assert.equal((await app.request(`/api/admin/admin-users/${manager.id}`, { method: 'PATCH', headers: supportHeaders, body: JSON.stringify({ roles: ['SUPPORT'], isActive: false }) })).status, 403);
  const managerSession = await createAdminSession({ ...sessionInput, adminId: manager.id, email: manager.email, tokenVersion: manager.tokenVersion });
  const list = await app.request('/api/admin/admin-users', { headers: { Authorization: `Bearer ${managerSession.accessToken}` } });
  assert.equal(list.status, 200);
  const json = await list.text();
  for (const sensitive of ['inviteTokenHash', 'mfaSecretEncrypted', 'refreshTokenHash', '"password"']) assert.ok(!json.includes(sensitive));
  await changeManagedAdmin(manager.id, support.id, { isActive: false, roles: ['READ_ONLY_AUDITOR'] });
  assert.equal((await app.request('/api/admin/auth/me', { headers: supportHeaders })).status, 401);
  assert.equal(await rotateAdminSession(session.refreshToken, secret), null);
  await changeManagedAdmin(manager.id, support.id, { isActive: true, roles: ['READ_ONLY_AUDITOR'] });
  const updated = await prisma.adminUser.findUniqueOrThrow({ where: { id: support.id } });
  const newSession = await createAdminSession({ ...sessionInput, tokenVersion: updated.tokenVersion });
  await revokeManagedAdminSessions(manager.id, support.id);
  assert.equal(await rotateAdminSession(newSession.refreshToken, secret), null);
  const users = await listManagedAdmins();
  assert.equal(users.find((user) => user.id === support.id)?.activeSessionCount, 0);
  console.log('Admin user management integration: OK');
}

main().finally(async () => {
  await prisma.adminUser.deleteMany({ where: { OR: [{ id: { in: adminIds } }, { email: { in: [invitedEmail, failedEmail] } }] } });
  await prisma.$disconnect();
}).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
