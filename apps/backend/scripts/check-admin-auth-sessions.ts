import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Hono } from 'hono';
import { prisma } from '../src/lib/prisma.js';
import { adminRoutes } from '../src/routes/admin.routes.js';
import { createAdminSession, rotateAdminSession, revokeAdminSession } from '../src/modules/platform/admin-auth/admin-session.service.js';
import { encryptTotpSecret, verifyTotp } from '../src/modules/platform/admin-auth/totp.service.js';

const seed = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const password = 'Integration-password-strong-123!';
const suffix = `${Date.now()}-${process.pid}`;
let adminId: string | undefined;

function currentCode(offset = 0): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const digest = createHmac('sha1', '12345678901234567890').update(message).digest();
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}

async function main(): Promise<void> {
  assert.equal(verifyTotp(seed, '287082', 59000), true, 'RFC TOTP vector');
  assert.equal(verifyTotp(seed, '000000', 59000), false);
  const jwtSecret = process.env.ADMIN_JWT_SECRET;
  assert.ok(jwtSecret);
  const role = await prisma.adminRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
  const admin = await prisma.adminUser.create({ data: {
    email: `admin-session-${suffix}@test.local`, name: 'Session integration', password: await bcrypt.hash(password, 4),
    mfaSecretEncrypted: encryptTotpSecret(seed, jwtSecret),
    roleAssignments: { create: { adminRoleId: role.id } },
  } });
  adminId = admin.id;
  await prisma.adminSession.create({ data: {
    adminUserId: admin.id, refreshTokenHash: `historical-${suffix}`, deviceName: 'Previous device',
    userAgent: 'Previous device', ipAddress: '192.0.2.1', mfaVerifiedAt: new Date(),
    expiresAt: new Date(), revokedAt: new Date(),
  } });
  const app = new Hono();
  app.route('/api/admin', adminRoutes);
  const login = (otp?: string) => app.request('/api/admin/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: admin.email, password, otp, rememberMe: false }),
  });
  const challenge = await login();
  assert.equal(challenge.status, 200);
  assert.equal(challenge.headers.get('set-cookie'), null, 'No cookies before MFA');
  assert.equal((await app.request('/api/admin/auth/me')).status, 401);
  const authenticated = await login(currentCode());
  assert.equal(authenticated.status, 200);
  const cookies = authenticated.headers.get('set-cookie') ?? '';
  assert.ok(cookies.includes('axon_admin_refresh='));
  const replay = await login(currentCode());
  assert.equal(replay.status, 401, 'TOTP replay rejected');

  const session = await createAdminSession({ adminId: admin.id, email: admin.email, tokenVersion: 0, rememberMe: false, ipAddress: null, userAgent: 'test', jwtSecret });
  const sessionId = session.refreshToken.split('.')[0];
  const oldMfa = new Date(Date.now() - 11 * 60000);
  await prisma.adminSession.update({ where: { id: sessionId }, data: { mfaVerifiedAt: oldMfa } });
  const headers = { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' };
  assert.equal((await app.request('/api/admin/auth/me', { headers })).status, 200);
  const securityEvents = await app.request('/api/admin/auth/security-events', { headers });
  assert.equal(securityEvents.status, 200);
  assert.ok((await securityEvents.text()).includes('SUSPICIOUS_LOGIN'), 'Changed device produces a visible security event');
  assert.equal((await app.request('/api/admin/change-requests/test/approve', { method: 'POST', headers, body: '{}' })).status, 403, 'Critical action requires recent MFA');
  const previewNamedTarget = await app.request('/api/admin/tenants/preview', { method: 'PATCH', headers, body: '{}' });
  assert.equal(previewNamedTarget.status, 403, 'A target named preview must not bypass recent MFA');
  assert.ok((await previewNamedTarget.text()).includes('ADMIN_REAUTH_REQUIRED'));
  const before = await prisma.adminSession.findUniqueOrThrow({ where: { id: sessionId } });
  const rotations = await Promise.all([rotateAdminSession(session.refreshToken, jwtSecret), rotateAdminSession(session.refreshToken, jwtSecret)]);
  assert.equal(rotations.filter(Boolean).length, 1, 'Only one concurrent refresh succeeds');
  const refreshed = rotations.find((entry) => entry !== null);
  assert.ok(refreshed);
  assert.equal(refreshed.rememberMe, false);
  const after = await prisma.adminSession.findUniqueOrThrow({ where: { id: sessionId } });
  assert.equal(after.mfaVerifiedAt.getTime(), oldMfa.getTime(), 'Refresh must not renew MFA');
  assert.equal(after.expiresAt.getTime(), before.expiresAt.getTime(), 'Refresh must preserve absolute expiry');
  assert.equal(await rotateAdminSession(session.refreshToken, jwtSecret), null);
  const reauthenticated = await app.request('/api/admin/auth/reauthenticate', {
    method: 'POST', headers, body: JSON.stringify({ password, otp: currentCode(1) }),
  });
  assert.equal(reauthenticated.status, 200, 'Fresh password and MFA reauthenticate the session');
  const activeSessions = await app.request('/api/admin/auth/sessions', { headers });
  const sessionJson = await activeSessions.text();
  assert.equal(activeSessions.status, 200);
  assert.ok(!sessionJson.includes('refreshTokenHash'), 'Session list never exposes refresh credentials');
  const closed = await app.request(`/api/admin/auth/sessions/${sessionId}`, { method: 'DELETE', headers });
  assert.equal(closed.status, 200, 'Recently reauthenticated session can be closed through HTTP');
  await revokeAdminSession(sessionId, admin.id);
  assert.equal((await app.request('/api/admin/auth/me', { headers })).status, 401, 'Revocation invalidates access JWT');
  assert.equal(await rotateAdminSession(refreshed.refreshToken, jwtSecret), null);
  const persistent = await createAdminSession({ adminId: admin.id, email: admin.email, tokenVersion: 0, rememberMe: true, ipAddress: null, userAgent: 'test', jwtSecret });
  assert.ok(persistent.refreshMaxAge > session.refreshMaxAge);
  await prisma.adminUser.update({ where: { id: admin.id }, data: { tokenVersion: { increment: 1 } } });
  assert.equal(await rotateAdminSession(persistent.refreshToken, jwtSecret), null, 'Token version invalidates refresh');
  console.log('Admin MFA/session integration: OK');
}

main().finally(async () => {
  if (adminId) await prisma.adminUser.delete({ where: { id: adminId } });
  await prisma.$disconnect();
}).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
