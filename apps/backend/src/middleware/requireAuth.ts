import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import { ForbiddenError } from '../errors';

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) throw new Error('JWT_SECRET ortam değişkeni tanımlı değil. Uygulama başlatılamaz.');

interface JwtPayload {
  userId: string;
  tenantId: string;
}

/**
 * JWT doğrulama middleware'i.
 * Authorization header'dan token okur, doğrular ve userId + tenantId'yi context'e set eder.
 * tenantId her zaman JWT payload'dan alınır — header override yapılamaz.
 */
export async function requireAuth(c: Context<any>, next: Next) {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json(new ForbiddenError('Yetkilendirme gerekli.').toJSON(), 401);
  }

  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;

    c.set('userId', payload.userId);
    c.set('tenantId', payload.tenantId);

    await next();
  } catch {
    return c.json(new ForbiddenError('Geçersiz veya süresi dolmuş token.').toJSON(), 401);
  }
}
