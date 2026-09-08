import type { AdminPermission } from '@repo/types';
import type { Context, MiddlewareHandler, Next } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import jwt from 'jsonwebtoken';
import { resolveAdminAccess, ADMIN_RECENT_MFA_SECONDS } from '../modules/platform/application/index.js';
import type { AdminAccessContext, AdminJwtPayload } from '../modules/platform/application/index.js';
import { prisma } from '../lib/prisma.js';

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ADMIN_COOKIE_NAME = 'axon_admin_token';
if (!ADMIN_JWT_SECRET) throw new Error('ADMIN_JWT_SECRET ortam değişkeni zorunludur.');
const RESOLVED_ADMIN_JWT_SECRET = ADMIN_JWT_SECRET;

function isAdminJwtPayload(value: string | jwt.JwtPayload): value is jwt.JwtPayload & AdminJwtPayload {
  return typeof value !== 'string'
    && typeof value.adminId === 'string'
    && typeof value.email === 'string'
    && value.role === 'admin'
    && typeof value.sessionId === 'string'
    && typeof value.tokenVersion === 'number'
    && typeof value.mfaVerifiedAt === 'string';
}

export async function requireAdmin(c: Context, next: Next): Promise<Response | void> {
  const auth = c.req.header('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : getCookie(c, ADMIN_COOKIE_NAME);
  if (!token) return c.json({ error: 'Yetkilendirme gerekli.', code: 'UNAUTHORIZED' }, 401);

  let access: Awaited<ReturnType<typeof resolveAdminAccess>>;
  try {
    const payload = jwt.verify(token, RESOLVED_ADMIN_JWT_SECRET);
    if (!isAdminJwtPayload(payload)) throw new Error('Invalid admin token');
    access = await resolveAdminAccess(payload.adminId);
    const session = await prisma.adminSession.findFirst({ where: {
      id: payload.sessionId, adminUserId: payload.adminId, revokedAt: null, expiresAt: { gt: new Date() },
      adminUser: { tokenVersion: payload.tokenVersion, mfaEnabled: true },
    } });
    if (!session) throw new Error('Invalid admin session');
    c.set('adminSessionId', session.id);
    c.set('adminMfaVerifiedAt', session.mfaVerifiedAt.toISOString());
    void prisma.adminSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  } catch {
    deleteCookie(c, ADMIN_COOKIE_NAME, { path: '/', secure: IS_PRODUCTION, sameSite: 'Lax' });
    return c.json({ error: 'Geçersiz veya süresi dolmuş oturum.', code: 'UNAUTHORIZED' }, 401);
  }

  if (!access) {
    deleteCookie(c, ADMIN_COOKIE_NAME, { path: '/', secure: IS_PRODUCTION, sameSite: 'Lax' });
    return c.json({ error: 'Admin hesabı aktif değil.', code: 'UNAUTHORIZED' }, 401);
  }

  c.set('adminId', access.id);
  c.set('adminEmail', access.email);
  c.set('adminRoles', access.roles);
  c.set('adminPermissions', access.permissions);
  await next();
}

export const requireRecentAdminMfa: MiddlewareHandler = async (c, next) => {
  const verifiedAt = new Date(c.get('adminMfaVerifiedAt')).getTime();
  if (!Number.isFinite(verifiedAt) || Date.now() - verifiedAt > ADMIN_RECENT_MFA_SECONDS * 1000) {
    return c.json({ error: 'Bu kritik işlem için MFA ile yeniden doğrulama gerekli.', code: 'ADMIN_REAUTH_REQUIRED' }, 403);
  }
  await next();
};

export function requireAdminPermission(permission: AdminPermission): MiddlewareHandler {
  return async (c, next) => {
    const permissions: AdminAccessContext['adminPermissions'] | undefined = c.get('adminPermissions');
    if (!permissions?.includes(permission)) {
      return c.json({ error: 'Bu işlem için yetkiniz bulunmuyor.', code: 'FORBIDDEN', permission }, 403);
    }
    await next();
  };
}
