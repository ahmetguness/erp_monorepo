import bcrypt from 'bcryptjs';
import type { Context } from 'hono';
import { z } from 'zod';
import { prisma } from '../../../../../lib/prisma.js';
import { rateLimiter } from '../../../../../lib/rateLimiter.js';
import { consumeAdminMfa } from '../../../admin-auth/admin-mfa.service.js';
import { revokeAdminSession } from '../../../admin-auth/admin-session.service.js';
import { RESOLVED_ADMIN_SECRET } from './shared.js';

const reauthSchema = z.object({ password: z.string().min(1).max(256), otp: z.string().regex(/^\d{6}$/) }).strict();

export const AdminSessionController = {
  async list(c: Context): Promise<Response> {
    const sessions = await prisma.adminSession.findMany({
      where: { adminUserId: c.get('adminId'), revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, deviceName: true, ipAddress: true, createdAt: true, lastSeenAt: true, expiresAt: true, rememberMe: true },
      orderBy: { lastSeenAt: 'desc' },
    });
    return c.json({ data: sessions.map((session) => ({ ...session, current: session.id === c.get('adminSessionId') })) });
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
    if (await rateLimiter.check(`admin-reauth:${adminId}`, 5, 15 * 60 * 1000)) return c.json({ error: 'Çok fazla deneme. Daha sonra tekrar deneyin.' }, 429);
    const body = reauthSchema.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!body.success) return c.json({ error: 'Şifre ve altı haneli doğrulama kodu gerekli.' }, 400);
    const admin = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    if (!await bcrypt.compare(body.data.password, admin.password) || !admin.mfaSecretEncrypted || !await consumeAdminMfa(adminId, admin.mfaSecretEncrypted, body.data.otp, RESOLVED_ADMIN_SECRET)) {
      return c.json({ error: 'Şifre veya doğrulama kodu geçersiz. Kullanılmış kodlar tekrar kullanılamaz.' }, 401);
    }
    await prisma.adminSession.updateMany({ where: { id: c.get('adminSessionId'), adminUserId: adminId, revokedAt: null }, data: { mfaVerifiedAt: new Date() } });
    return c.json({ data: { success: true } });
  },
  async revoke(c: Context): Promise<Response> {
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'Oturum gerekli.' }, 400);
    const revoked = await revokeAdminSession(id, c.get('adminId'));
    return c.json({ data: { success: revoked } });
  },
  async revokeAll(c: Context): Promise<Response> {
    await prisma.$transaction([
      prisma.adminUser.update({ where: { id: c.get('adminId') }, data: { tokenVersion: { increment: 1 } } }),
      prisma.adminSession.updateMany({ where: { adminUserId: c.get('adminId'), revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return c.json({ data: { success: true } });
  },
};
