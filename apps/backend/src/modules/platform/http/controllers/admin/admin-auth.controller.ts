import bcrypt from 'bcryptjs';
import { Context } from 'hono';
import { deleteCookie,setCookie } from 'hono/cookie';
import jwt from 'jsonwebtoken';
import { ValidationError } from '../../../../../errors/index.js';
import { prisma } from '../../../../../lib/prisma.js';
import { rateLimiter } from '../../../../../lib/rateLimiter.js';
import { resolveAdminAccess } from '../../../admin-access/admin-access.service.js';
import { ADMIN_COOKIE_MAX_AGE,ADMIN_COOKIE_NAME,ADMIN_LOGIN_LIMIT,ADMIN_LOGIN_LOCKOUT_FAILURES,ADMIN_LOGIN_LOCKOUT_WINDOW_MS,ADMIN_LOGIN_WINDOW_MS,getAdminLoginLimitKeys,getClientIp,IS_PRODUCTION,normalizeEmail,recordAdminLoginFailure,RESOLVED_ADMIN_SECRET } from './shared.js';

export const AdminAuthController = {
  async login(c: Context): Promise<Response> {
    const ip = getClientIp(c);
    const rawBody = await c.req.json<{ email?: unknown; password?: unknown }>().catch(() => null);
    const email = typeof rawBody?.email === 'string' ? normalizeEmail(rawBody.email) : '';
    const password = typeof rawBody?.password === 'string' ? rawBody.password : '';
    const { ipAttemptKey, emailAttemptKey, ipFailureKey } = getAdminLoginLimitKeys(ip, email || 'unknown');

    if (await rateLimiter.isBlocked(ipFailureKey, ADMIN_LOGIN_LOCKOUT_FAILURES)) {
      recordAdminLoginFailure(c, email || 'unknown', 'ip_locked');
      return c.json({ error: 'Çok fazla başarısız giriş denemesi. Lütfen 1 saat sonra tekrar deneyin.' }, 429);
    }

    if (await rateLimiter.check(ipAttemptKey, ADMIN_LOGIN_LIMIT, ADMIN_LOGIN_WINDOW_MS)) {
      return c.json({ error: 'Çok fazla giriş denemesi.' }, 429);
    }

    if (email && await rateLimiter.check(emailAttemptKey, ADMIN_LOGIN_LIMIT, ADMIN_LOGIN_WINDOW_MS)) {
      return c.json({ error: 'Çok fazla giriş denemesi.' }, 429);
    }
    if (!email || !password) return c.json(new ValidationError('Email ve şifre zorunludur.').toJSON(), 400);

    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin || !admin.isActive) {
      recordAdminLoginFailure(c, email, 'invalid_admin');
      if (await rateLimiter.check(ipFailureKey, ADMIN_LOGIN_LOCKOUT_FAILURES - 1, ADMIN_LOGIN_LOCKOUT_WINDOW_MS)) {
        return c.json({ error: 'Çok fazla başarısız giriş denemesi. Lütfen 1 saat sonra tekrar deneyin.' }, 429);
      }
      return c.json({ error: 'Geçersiz kimlik bilgileri.' }, 401);
    }

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      recordAdminLoginFailure(c, email, 'invalid_password');
      if (await rateLimiter.check(ipFailureKey, ADMIN_LOGIN_LOCKOUT_FAILURES - 1, ADMIN_LOGIN_LOCKOUT_WINDOW_MS)) {
        return c.json({ error: 'Çok fazla başarısız giriş denemesi. Lütfen 1 saat sonra tekrar deneyin.' }, 429);
      }
      return c.json({ error: 'Geçersiz kimlik bilgileri.' }, 401);
    }

    const access = await resolveAdminAccess(admin.id);
    if (!access || access.roles.length === 0) {
      return c.json({ error: 'Bu admin hesabına aktif bir rol atanmamış.' }, 403);
    }

    await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    await Promise.all([
      rateLimiter.reset(ipAttemptKey),
      rateLimiter.reset(emailAttemptKey),
      rateLimiter.reset(ipFailureKey),
    ]);

    const token = jwt.sign({ adminId: admin.id, email: admin.email, role: 'admin' }, RESOLVED_ADMIN_SECRET, { expiresIn: '24h' });

    setCookie(c, ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: 'Lax',
      path: '/',
      maxAge: ADMIN_COOKIE_MAX_AGE,
    });

    return c.json({ data: { admin: access } });
  },

  async logout(c: Context): Promise<Response> {
    deleteCookie(c, ADMIN_COOKIE_NAME, {
      path: '/',
      secure: IS_PRODUCTION,
      sameSite: 'Lax',
    });
    return c.json({ data: { success: true } });
  },

  async me(c: Context): Promise<Response> {
    const adminId = c.get('adminId') as string;
    const admin = await resolveAdminAccess(adminId);
    if (!admin) return c.json({ error: 'Admin bulunamadı.' }, 404);
    return c.json({ data: admin });
  },
};

// ─────────────────────────────────────────────
// Tenant Management
// ─────────────────────────────────────────────
