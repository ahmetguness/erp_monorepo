import 'dotenv/config';
import assert from 'node:assert/strict';
import { prisma } from '../../src/lib/prisma.js';
import { createAdminSession, revokeAdminSession, rotateAdminSession } from '../../src/modules/platform/admin-auth/admin-session.service.js';
import { buildTotpUri, decryptTotpSecret, encryptTotpSecret, generateTotpSecret, verifyTotp } from '../../src/modules/platform/admin-auth/totp.service.js';

const suffix = `${Date.now()}-${process.pid}`;
async function main(): Promise<void> {
  const secret = generateTotpSecret();
  const encryptionSecret = 'admin-assurance-encryption-secret';
  assert.equal(decryptTotpSecret(encryptTotpSecret(secret, encryptionSecret), encryptionSecret), secret);
  assert.match(buildTotpUri(`auth-${suffix}@test.local`, secret), /^otpauth:\/\/totp\//u);
  assert.equal(verifyTotp(secret, 'invalid'), false);
  const admin = await prisma.adminUser.create({ data: { name: 'Auth Assurance', email: `auth-${suffix}@test.local`, password: 'unused', mfaEnabled: true } });
  try {
    const session = await createAdminSession({ adminId: admin.id, email: admin.email, tokenVersion: admin.tokenVersion, rememberMe: false, ipAddress: '127.0.0.1', userAgent: 'admin-assurance', jwtSecret: encryptionSecret });
    const rotated = await rotateAdminSession(session.refreshToken, encryptionSecret);
    assert.ok(rotated);
    assert.equal(await rotateAdminSession(session.refreshToken, encryptionSecret), null, 'Kullanılmış refresh token tekrar kullanılamaz.');
    const sessionId = rotated.refreshToken.split('.')[0];
    assert.ok(sessionId);
    assert.equal(await revokeAdminSession(sessionId, admin.id), true);
    assert.equal(await rotateAdminSession(rotated.refreshToken, encryptionSecret), null);
    console.log('Admin auth assurance: OK (MFA crypto, rotation, replay, revoke)');
  } finally {
    await prisma.adminUser.delete({ where: { id: admin.id } });
    await prisma.$disconnect();
  }
}
main().catch(async (error: unknown) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
