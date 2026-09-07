import bcrypt from 'bcryptjs';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { ValidationError } from '../../../../../errors/index.js';
import { prisma } from '../../../../../lib/prisma.js';
import { rateLimiter } from '../../../../../lib/rateLimiter.js';
import { getRequestMeta } from '../../../../../utils/audit.js';
import { resolveAdminAccess } from '../../../admin-access/admin-access.service.js';
import { createAdminSession, logoutAdminSession, rotateAdminSession } from '../../../admin-auth/admin-session.service.js';
import { buildTotpUri, decryptTotpSecret, encryptTotpSecret, generateTotpSecret } from '../../../admin-auth/totp.service.js';
import { consumeAdminMfa } from '../../../admin-auth/admin-mfa.service.js';
import { ADMIN_COOKIE_MAX_AGE, ADMIN_COOKIE_NAME, ADMIN_LOGIN_LIMIT, ADMIN_LOGIN_LOCKOUT_FAILURES, ADMIN_LOGIN_LOCKOUT_WINDOW_MS, ADMIN_LOGIN_WINDOW_MS, ADMIN_REFRESH_COOKIE_NAME, getAdminLoginLimitKeys, getClientIp, IS_PRODUCTION, normalizeEmail, recordAdminLoginFailure, RESOLVED_ADMIN_SECRET } from './shared.js';

interface LoginBody { email?: unknown; password?: unknown; otp?: unknown; rememberMe?: unknown }
const cookieOptions = () => ({ httpOnly: true, secure: IS_PRODUCTION, sameSite: 'Lax' as const, path: '/' });

function setSessionCookies(c: Context, session: { accessToken: string; refreshToken: string; refreshMaxAge: number }, rememberMe: boolean): void {
  setCookie(c, ADMIN_COOKIE_NAME, session.accessToken, { ...cookieOptions(), maxAge: ADMIN_COOKIE_MAX_AGE });
  setCookie(c, ADMIN_REFRESH_COOKIE_NAME, session.refreshToken, { ...cookieOptions(), ...(rememberMe ? { maxAge: session.refreshMaxAge } : {}) });
}
function clearSessionCookies(c: Context): void {
  const options = { path: '/', secure: IS_PRODUCTION, sameSite: 'Lax' as const };
  deleteCookie(c, ADMIN_COOKIE_NAME, options); deleteCookie(c, ADMIN_REFRESH_COOKIE_NAME, options);
}

export const AdminAuthController = {
  async login(c: Context): Promise<Response> {
    const ip = getClientIp(c);
    const rawBody = await c.req.json<LoginBody>().catch(() => null);
    const email = typeof rawBody?.email === 'string' ? normalizeEmail(rawBody.email) : '';
    const password = typeof rawBody?.password === 'string' ? rawBody.password : '';
    const otp = typeof rawBody?.otp === 'string' ? rawBody.otp.trim() : '';
    const rememberMe = rawBody?.rememberMe === true;
    const { ipAttemptKey, emailAttemptKey, ipFailureKey } = getAdminLoginLimitKeys(ip, email || 'unknown');
    if (await rateLimiter.isBlocked(ipFailureKey, ADMIN_LOGIN_LOCKOUT_FAILURES)) {
      recordAdminLoginFailure(c, email || 'unknown', 'ip_locked'); return c.json({ error: 'Çok fazla başarısız giriş denemesi.' }, 429);
    }
    if (await rateLimiter.check(ipAttemptKey, ADMIN_LOGIN_LIMIT, ADMIN_LOGIN_WINDOW_MS) || (email && await rateLimiter.check(emailAttemptKey, ADMIN_LOGIN_LIMIT, ADMIN_LOGIN_WINDOW_MS))) return c.json({ error: 'Çok fazla giriş denemesi.' }, 429);
    if (!email || !password) return c.json(new ValidationError('Email ve şifre zorunludur.').toJSON(), 400);
    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin || !admin.isActive || !await bcrypt.compare(password, admin.password)) {
      recordAdminLoginFailure(c, email, admin ? 'invalid_password' : 'invalid_admin');
      await rateLimiter.check(ipFailureKey, ADMIN_LOGIN_LOCKOUT_FAILURES - 1, ADMIN_LOGIN_LOCKOUT_WINDOW_MS);
      return c.json({ error: 'Geçersiz kimlik bilgileri.' }, 401);
    }
    const access = await resolveAdminAccess(admin.id);
    if (!access || access.roles.length === 0) return c.json({ error: 'Bu admin hesabına aktif bir rol atanmamış.' }, 403);
    let secret: string;
    if (admin.mfaSecretEncrypted) secret = decryptTotpSecret(admin.mfaSecretEncrypted, RESOLVED_ADMIN_SECRET);
    else {
      secret = generateTotpSecret();
      await prisma.adminUser.updateMany({ where: { id: admin.id, mfaSecretEncrypted: null }, data: { mfaSecretEncrypted: encryptTotpSecret(secret, RESOLVED_ADMIN_SECRET) } });
      const stored = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
      if (!stored.mfaSecretEncrypted) throw new Error('MFA setup failed');
      secret = decryptTotpSecret(stored.mfaSecretEncrypted, RESOLVED_ADMIN_SECRET);
    }
    if (!otp) return c.json({ data: admin.mfaEnabled ? { status: 'MFA_REQUIRED' } : { status: 'MFA_SETUP_REQUIRED', secret, otpauthUri: buildTotpUri(admin.email, secret) } });
    const enrolled = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    if (!enrolled.mfaSecretEncrypted || !await consumeAdminMfa(admin.id, enrolled.mfaSecretEncrypted, otp, RESOLVED_ADMIN_SECRET)) {
      await rateLimiter.check(ipFailureKey, ADMIN_LOGIN_LOCKOUT_FAILURES - 1, ADMIN_LOGIN_LOCKOUT_WINDOW_MS);
      return c.json({ error: 'Geçersiz veya kullanılmış MFA kodu.' }, 401);
    }
    const meta = getRequestMeta(c);
    const previous = await prisma.adminSession.findFirst({ where: { adminUserId: admin.id }, orderBy: { createdAt: 'desc' } });
    const suspicious = Boolean(previous && (previous.ipAddress !== meta.ipAddress || previous.userAgent !== meta.userAgent));
    await prisma.$transaction([
      prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date(), mfaEnabled: true, mfaVerifiedAt: new Date() } }),
      ...(suspicious ? [prisma.adminSecurityEvent.create({ data: { adminUserId: admin.id, type: 'SUSPICIOUS_LOGIN', message: 'Yeni IP veya cihazdan admin girişi algılandı.', ipAddress: meta.ipAddress, userAgent: meta.userAgent } })] : []),
    ]);
    await Promise.all([rateLimiter.reset(ipAttemptKey), rateLimiter.reset(emailAttemptKey), rateLimiter.reset(ipFailureKey)]);
    const session = await createAdminSession({ adminId: admin.id, email: admin.email, tokenVersion: admin.tokenVersion, rememberMe, ipAddress: meta.ipAddress, userAgent: meta.userAgent, jwtSecret: RESOLVED_ADMIN_SECRET });
    setSessionCookies(c, session, rememberMe);
    return c.json({ data: { status: 'AUTHENTICATED', admin: access } });
  },
  async refresh(c: Context): Promise<Response> {
    const refresh = getCookie(c, ADMIN_REFRESH_COOKIE_NAME);
    const session = refresh ? await rotateAdminSession(refresh, RESOLVED_ADMIN_SECRET) : null;
    if (!session) { clearSessionCookies(c); return c.json({ error: 'Refresh oturumu geçersiz.' }, 401); }
    setSessionCookies(c, session, session.rememberMe); return c.json({ data: { success: true } });
  },
  async logout(c: Context): Promise<Response> {
    const refreshToken = getCookie(c, ADMIN_REFRESH_COOKIE_NAME);
    if (refreshToken) await logoutAdminSession(refreshToken);
    clearSessionCookies(c); return c.json({ data: { success: true } });
  },
  async me(c: Context): Promise<Response> {
    const admin = await resolveAdminAccess(c.get('adminId'));
    return admin ? c.json({ data: admin }) : c.json({ error: 'Admin bulunamadı.' }, 404);
  },
};
