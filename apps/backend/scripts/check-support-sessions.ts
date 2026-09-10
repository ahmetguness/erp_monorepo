import assert from 'node:assert/strict';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/lib/prisma.js';
import { BaseError } from '../src/errors/index.js';
import { adminRoutes } from '../src/routes/admin.routes.js';
import { contactRoutes } from '../src/routes/contact.routes.js';
import { productRoutes } from '../src/routes/product.routes.js';
import { supportSessionRoutes } from '../src/routes/support-session.routes.js';
import { requireAuth } from '../src/middleware/requireAuth.js';
import { registerBrowserProtection, registerPreRoutingMiddleware } from '../src/bootstrap/http/middleware.js';
import { createAdminSession } from '../src/modules/platform/admin-auth/admin-session.service.js';
import { supportRouteAllowed } from '../src/modules/platform/support-sessions/support-session-access.service.js';

const suffix = `${Date.now()}-${process.pid}`;
const tenantIds: string[] = [];
const userIds: string[] = [];
const adminIds: string[] = [];

async function main(): Promise<void> {
  assert.equal(supportRouteAllowed(['CONTACTS'], 'GET', '/api/contacts', false), true);
  for (const path of ['/api/auth/me', '/api/support-sessions', '/api/products', '/api/contacts/export', '/api/contacts/../settings']) {
    assert.equal(supportRouteAllowed(['CONTACTS'], 'GET', path, false), false);
  }
  const adminSecret = process.env.ADMIN_JWT_SECRET;
  const userSecret = process.env.JWT_SECRET;
  assert.ok(adminSecret && userSecret);
  for (const name of ['one', 'two']) {
    const tenant = await prisma.tenant.create({ data: { slug: `support-${name}-${suffix}`, companyName: name, email: `${name}-${suffix}@test.local`, status: 'ACTIVE', modules: ['CONTACTS', 'INVENTORY'] } });
    tenantIds.push(tenant.id);
  }
  const tenantId = tenantIds[0]!;
  const otherTenantId = tenantIds[1]!;
  for (const name of ['owner', 'target', 'outsider']) {
    const user = await prisma.user.create({ data: { name, email: `${name}-${suffix}@test.local`, password: 'unused' } });
    userIds.push(user.id);
    await prisma.tenantUser.create({ data: { tenantId: name === 'outsider' ? otherTenantId : tenantId, userId: user.id, isOwner: true } });
  }
  const ownerId = userIds[0]!;
  const targetId = userIds[1]!;
  const role = await prisma.adminRole.findUniqueOrThrow({ where: { key: 'SUPPORT' } });
  const admin = await prisma.adminUser.create({ data: { name: 'Support test', email: `support-admin-${suffix}@test.local`, password: 'unused', mfaEnabled: true, roleAssignments: { create: { adminRoleId: role.id } } } });
  adminIds.push(admin.id);
  const adminSession = await createAdminSession({ adminId: admin.id, email: admin.email, tokenVersion: admin.tokenVersion, jwtSecret: adminSecret, rememberMe: false, ipAddress: null, userAgent: 'support-test' });
  const contact = await prisma.contact.create({ data: { tenantId, name: 'Scoped contact', type: 'CUSTOMER', notes: 'Original' } });
  const otherContact = await prisma.contact.create({ data: { tenantId: otherTenantId, name: 'Other private contact', type: 'CUSTOMER' } });
  const app = new Hono();
  const origin = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000').split(',')[0]!.trim();
  registerPreRoutingMiddleware(app, { port: 3001, isProduction: false, role: 'api', allowedOrigins: [origin] });
  registerBrowserProtection(app);
  app.onError((error, c) => {
    if (error instanceof BaseError) return c.json({ error: error.message }, error.statusCode === 404 ? 404 : 403);
    console.error(error); return c.json({ error: 'Unexpected test error' }, 500);
  });
  app.route('/api/admin', adminRoutes);
  app.use('/api/*', requireAuth);
  app.route('/api/contacts', contactRoutes);
  app.route('/api/products', productRoutes);
  app.route('/api/support-sessions', supportSessionRoutes);
  const adminHeaders = { Authorization: `Bearer ${adminSession.accessToken}`, 'Content-Type': 'application/json', Origin: origin };
  const ownerHeaders = { Authorization: `Bearer ${jwt.sign({ userId: ownerId, tenantId }, userSecret)}`, 'Content-Type': 'application/json', Origin: origin };
  const outsiderHeaders = { Authorization: `Bearer ${jwt.sign({ userId: userIds[2], tenantId: otherTenantId }, userSecret)}`, 'Content-Type': 'application/json', Origin: origin };
  const preflight = await app.request('/api/contacts', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-support-session,x-support-tenant' } });
  assert.equal(preflight.status, 204);
  assert.ok(preflight.headers.get('access-control-allow-headers')?.toLowerCase().includes('x-support-session'));
  assert.ok(preflight.headers.get('access-control-allow-headers')?.toLowerCase().includes('x-support-tenant'));
  const input = { tenantId, targetUserId: targetId, reason: 'Investigate support issue', ticketId: 'SUP-123', scopes: ['CONTACTS'], durationMinutes: 30, writeRequested: true };
  assert.equal((await app.request('/api/admin/support-sessions', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ ...input, durationMinutes: 61 }) })).status, 400);
  assert.equal((await app.request('/api/admin/support-sessions', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ ...input, targetUserId: userIds[2] }) })).status, 404);
  assert.equal((await app.request('/api/admin/support-sessions', { method: 'POST', headers: adminHeaders, body: JSON.stringify(input) })).status, 201);
  const session = await prisma.supportSession.findFirstOrThrow({ where: { tenantId, adminId: admin.id } });
  const headers = { ...adminHeaders, 'X-Support-Session': session.id, 'X-Support-Tenant': tenantId };
  const decision = (action: string, authHeaders = ownerHeaders) => app.request(`/api/support-sessions/${session.id}/decision`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ action }) });
  const read = (path = '/api/contacts', authHeaders = headers) => app.request(path, { headers: authHeaders });
  const write = (body: unknown, id = contact.id) => app.request(`/api/contacts/${id}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
  assert.equal((await read()).status, 403, 'Owner approval required');
  assert.equal((await decision('approve', outsiderHeaders)).status, 404, 'Cross-tenant owner cannot approve');
  assert.equal((await decision('approve-write')).status, 403, 'Write approval is separate and ordered');
  assert.equal((await decision('approve')).status, 200);
  const approved = await prisma.supportSession.findFirstOrThrow({ where: { id: session.id, tenantId } });
  assert.equal((await decision('approve')).status, 403, 'Repeated approval must not overwrite consent');
  assert.equal((await prisma.supportSession.findFirstOrThrow({ where: { id: session.id, tenantId } })).approvedAt?.toISOString(), approved.approvedAt?.toISOString());
  const viewed = await read();
  assert.equal(viewed.status, 200);
  assert.ok((await viewed.text()).includes('Scoped contact'));
  assert.equal(viewed.headers.get('cache-control'), 'no-store');
  const cookieView = await app.request('/api/contacts', { headers: { Cookie: `axon_admin_token=${adminSession.accessToken}`, 'X-Support-Session': session.id, 'X-Support-Tenant': tenantId, Origin: origin } });
  assert.equal(cookieView.status, 200, 'Browser admin cookie authenticates the support request');
  assert.equal((await read('/api/products')).status, 403, 'Scope enforced');
  assert.equal((await read('/api/support-sessions')).status, 403, 'Support cannot approve itself');
  assert.equal((await write({ notes: 'Denied' })).status, 403);
  const writeDecisions = await Promise.all([decision('approve-write'), decision('approve-write')]);
  assert.deepEqual(writeDecisions.map(response => response.status).sort(), [200, 403], 'Only one concurrent approval may succeed');
  assert.equal((await write({ notes: 'Approved support note' })).status, 200);
  assert.equal((await prisma.contact.findFirstOrThrow({ where: { id: contact.id, tenantId } })).notes, 'Approved support note');
  const contactAudit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId, entityId: contact.id, module: 'contacts', action: 'UPDATE' } });
  assert.equal(contactAudit.adminId, admin.id, 'Business audit must identify the supporting admin, not only the target');
  assert.equal(contactAudit.ticketId, 'SUP-123');
  assert.equal((await write({ name: 'Privilege escalation' })).status, 403, 'Only notes writable');
  assert.equal((await write({ notes: 'Cross tenant' }, otherContact.id)).status, 404);
  assert.equal((await read('/api/contacts', { ...headers, 'X-Support-Tenant': otherTenantId })).status, 403);
  const secondAdminSession = await createAdminSession({ adminId: admin.id, email: admin.email, tokenVersion: admin.tokenVersion, jwtSecret: adminSecret, rememberMe: false, ipAddress: null, userAgent: 'another-browser' });
  assert.equal((await read('/api/contacts', { ...headers, Authorization: `Bearer ${secondAdminSession.accessToken}` })).status, 403, 'Bound to requesting admin session');
  await prisma.tenantUser.updateMany({ where: { tenantId, userId: targetId }, data: { isOwner: false } });
  assert.equal((await read()).status, 403, 'Target permissions apply');
  const targetHeaders = { Authorization: `Bearer ${jwt.sign({ userId: targetId, tenantId }, userSecret)}`, 'Content-Type': 'application/json', Origin: origin };
  assert.equal((await decision('revoke', targetHeaders)).status, 403, 'Non-owner cannot decide even inside the same tenant');
  await prisma.tenantUser.updateMany({ where: { tenantId, userId: targetId }, data: { isOwner: true } });
  await prisma.tenantUser.updateMany({ where: { tenantId, userId: ownerId }, data: { isOwner: false } });
  assert.equal((await read()).status, 403, 'Consent becomes invalid when approver loses ownership');
  await prisma.tenantUser.updateMany({ where: { tenantId, userId: ownerId }, data: { isOwner: true } });
  await prisma.adminUserRole.deleteMany({ where: { adminUserId: admin.id } });
  assert.equal((await read()).status, 403, 'Current admin permission is required on every request');
  await prisma.adminUserRole.create({ data: { adminUserId: admin.id, adminRoleId: role.id } });
  await prisma.adminSession.updateMany({ where: { adminUserId: admin.id }, data: { mfaVerifiedAt: new Date(0) } });
  assert.equal((await write({ notes: 'Stale MFA' })).status, 403);
  const ended = await app.request(`/api/admin/tenants/${tenantId}/support-sessions/${session.id}/revoke`, { method: 'POST', headers: adminHeaders });
  assert.equal(ended.status, 200, 'Stale step-up MFA must not prevent access revocation');
  assert.equal((await read()).status, 403);
  // Restore only this synthetic fixture to continue testing other terminal states.
  await prisma.supportSession.updateMany({ where: { id: session.id, tenantId }, data: { revokedAt: null } });
  await prisma.adminSession.updateMany({ where: { adminUserId: admin.id }, data: { mfaVerifiedAt: new Date() } });
  await prisma.user.update({ where: { id: targetId }, data: { isActive: false } });
  assert.equal((await read()).status, 403, 'Inactive target denied');
  await prisma.user.update({ where: { id: targetId }, data: { isActive: true } });
  await prisma.supportSession.updateMany({ where: { id: session.id, tenantId }, data: { expiresAt: new Date(0) } });
  assert.equal((await read()).status, 403, 'Automatic expiry');
  await prisma.supportSession.updateMany({ where: { id: session.id, tenantId }, data: { expiresAt: new Date(Date.now() + 60000) } });
  assert.equal((await decision('revoke')).status, 200);
  assert.equal((await read()).status, 403, 'Revocation immediate');
  const logs = await prisma.auditLog.findMany({ where: { tenantId, entityId: session.id, module: 'SUPPORT_SESSION' } });
  assert.ok(logs.some(log => log.adminId === admin.id && log.userId === targetId && log.ticketId === 'SUP-123'));
  assert.ok(logs.some(log => log.userId === ownerId && !log.adminId));
  assert.ok(logs.length >= 10);
  await prisma.adminSession.updateMany({ where: { adminUserId: admin.id }, data: { revokedAt: new Date() } });
  assert.equal((await read()).status, 401, 'Admin logout/revocation invalidates support access');
  console.log('Support sessions integration: OK (consent, scopes, expiry, revocation, target permissions, session binding, write approval, audit)');
}

main().finally(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
  await prisma.$disconnect();
}).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
