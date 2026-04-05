import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'axon-dev-secret-change-in-production';

interface AdminPayload { adminId: string; email: string; role: 'admin' }

export async function requireAdmin(c: Context, next: Next) {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Yetkilendirme gerekli.', code: 'UNAUTHORIZED' }, 401);
  }

  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as AdminPayload;
    if (payload.role !== 'admin') throw new Error('Not admin');
    c.set('adminId', payload.adminId);
    c.set('adminEmail', payload.email);
    await next();
  } catch {
    return c.json({ error: 'Geçersiz veya süresi dolmuş token.', code: 'UNAUTHORIZED' }, 401);
  }
}
