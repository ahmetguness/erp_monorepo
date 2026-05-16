import { Context, Next } from 'hono';
import { getCookie, deleteCookie } from 'hono/cookie';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET ortam değişkeni tanımlı değil. Uygulama başlatılamaz.');

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (!ADMIN_JWT_SECRET) {
  throw new Error('ADMIN_JWT_SECRET ortam değişkeni zorunludur.');
}
const RESOLVED_ADMIN_SECRET = ADMIN_JWT_SECRET;

const ADMIN_COOKIE_NAME = 'axon_admin_token';

interface AdminPayload { adminId: string; email: string; role: 'admin' }

export async function requireAdmin(c: Context, next: Next) {
  const auth = c.req.header('Authorization');
  const cookieToken = getCookie(c, ADMIN_COOKIE_NAME);
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : cookieToken;

  if (!token) {
    return c.json({ error: 'Yetkilendirme gerekli.', code: 'UNAUTHORIZED' }, 401);
  }

  try {
    const payload = jwt.verify(token, RESOLVED_ADMIN_SECRET) as AdminPayload;
    if (payload.role !== 'admin') throw new Error('Not admin');
    c.set('adminId', payload.adminId);
    c.set('adminEmail', payload.email);
    await next();
  } catch {
    deleteCookie(c, ADMIN_COOKIE_NAME, {
      path: '/',
      secure: IS_PRODUCTION,
      sameSite: 'Lax',
    });
    return c.json({ error: 'Geçersiz veya süresi dolmuş token.', code: 'UNAUTHORIZED' }, 401);
  }
}
