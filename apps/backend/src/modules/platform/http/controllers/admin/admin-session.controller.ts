import bcrypt from 'bcryptjs';
import type { Context } from 'hono';
import { z } from 'zod';
import { prisma } from '../../../../../lib/prisma.js';
import { rateLimiter } from '../../../../../lib/rateLimiter.js';
import { consumeAdminMfa } from '../../../admin-auth/admin-mfa.service.js';
import { ADMIN_RECENT_MFA_SECONDS } from '../../../admin-auth/admin-session.service.js';
import { RESOLVED_ADMIN_SECRET } from './shared.js';
import { getTrustedClientIpOrNull } from '../../../../../utils/request-ip.js';

const reauthSchema = z.object({ password: z.string().min(1).max(256), otp: z.string().regex(/^\d{6}$/) }).strict();

export const AdminSessionController = {
  async list(c: Context): Promise<Response> {
    const sessions = await prisma.adminSession.findMany({
      where: { adminUserId: c.get('adminId'), revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, deviceName: true, ipAddress: true, createdAt: true, lastSeenAt: true, expiresAt: true, rememberMe: true, mfaVerifiedAt: true },
      orderBy: { lastSeenAt: 'desc' },
    });
    return c.json({ data: sessions.map(({ mfaVerifiedAt, ...session }) => ({
      ...session,
      current: session.id === c.get('adminSessionId'),
      reauthenticationExpiresAt: new Date(mfaVerifiedAt.getTime() + ADMIN_RECENT_MFA_SECONDS * 1000).toISOString(),
    })) });
  },
  async events(c: Context): Promise<Response> {
    const events = await prisma.adminSecurityEvent.findMany({
      where: { adminUserId: c.get('adminId') }, orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, type: true, message: true, ipAddress: true, createdAt: true },
    });
    return c.json({ data: events });
  },
  async reauthenticate(c: Context): Promise<Response> {
    const adminId = c.get('adminId');
    const rateLimitKey = `admin-reauth:${adminId}`;
    if (await rateLimiter.check(rateLimitKey, 5, 15 * 60 * 1000)) return c.json({ error: { code: 'RATE_LIMITED', message: 'Çok fazla deneme. Daha sonra tekrar deneyin.' } }, 429);
    const body = reauthSchema.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!body.success) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Şifre ve altı haneli doğrulama kodu gerekli.' } }, 400);
    const admin = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    if (!await bcrypt.compare(body.data.password, admin.password) || !admin.mfaSecretEncrypted || !await consumeAdminMfa(adminId, admin.mfaSecretEncrypted, body.data.otp, RESOLVED_ADMIN_SECRET)) {
      return c.json({ error: { code: 'INVALID_CREDENTIALS', message: 'Şifre veya doğrulama kodu geçersiz. Kullanılmış kodlar tekrar kullanılamaz.' } }, 401);
    }
    const verifiedAt = new Date();
    await prisma.$transaction([
      prisma.adminSession.updateMany({ where: { id: c.get('adminSessionId'), adminUserId: adminId, revokedAt: null }, data: { mfaVerifiedAt: verifiedAt } }),
      prisma.adminSecurityEvent.create({ data: { adminUserId: adminId, type: 'ADMIN_REAUTHENTICATED', message: 'Kritik işlemler için MFA ile yeniden doğrulama başarılı.', ipAddress: getTrustedClientIpOrNull(c), userAgent: c.req.header('user-agent') ?? null } }),
    ]);
    await rateLimiter.reset(rateLimitKey);
    return c.json({ data: {
      success: true,
      reauthenticationExpiresAt: new Date(verifiedAt.getTime() + ADMIN_RECENT_MFA_SECONDS * 1000).toISOString(),
    } });
  },
  async revoke(c: Context): Promise<Response> {
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'Oturum gerekli.' }, 400);
    const adminId = c.get('adminId');
    const revoked = await prisma.$transaction(async (tx) => {
      const result = await tx.adminSession.updateMany({ where: { id, adminUserId: adminId, revokedAt: null }, data: { revokedAt: new Date() } });
      if (result.count === 1) await tx.adminSecurityEvent.create({ data: { adminUserId: adminId, type: 'ADMIN_SESSION_REVOKED', message: `Oturum sonlandırıldı: ${id}`, ipAddress: getTrustedClientIpOrNull(c), userAgent: c.req.header('user-agent') ?? null } });
      return result.count === 1;
    });
    return c.json({ data: { success: revoked } });
  },
  async revokeAll(c: Context): Promise<Response> {
    await prisma.$transaction([
      prisma.adminUser.update({ where: { id: c.get('adminId') }, data: { tokenVersion: { increment: 1 } } }),
      prisma.adminSession.updateMany({ where: { adminUserId: c.get('adminId'), revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.adminSecurityEvent.create({ data: { adminUserId: c.get('adminId'), type: 'ADMIN_ALL_SESSIONS_REVOKED', message: 'Tüm yönetici oturumları sonlandırıldı.', ipAddress: getTrustedClientIpOrNull(c), userAgent: c.req.header('user-agent') ?? null } }),
    ]);
    return c.json({ data: { success: true } });
  },
};
