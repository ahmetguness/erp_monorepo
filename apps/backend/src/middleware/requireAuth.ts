import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { ForbiddenError } from '../errors';

const JWT_SECRET = process.env.JWT_SECRET ?? 'axon-dev-secret-change-in-production';

interface JwtPayload {
  userId: string;
  tenantId: string;
}

/**
 * JWT doğrulama middleware'i.
 * Authorization header'dan token okur, doğrular ve userId + tenantId'yi context'e set eder.
 * x-tenant-id header'ı varsa, kullanıcının o tenant'a erişimi olduğunu doğrular.
 */
export async function requireAuth(c: Context, next: Next) {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json(new ForbiddenError('Yetkilendirme gerekli.').toJSON(), 401);
  }

  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;

    const headerTenantId = c.req.header('x-tenant-id');
    const tenantId = headerTenantId ?? payload.tenantId;

    // Header'dan farklı bir tenant geliyorsa, kullanıcının o tenant'a erişimi var mı kontrol et
    if (headerTenantId && headerTenantId !== payload.tenantId) {
      const hasAccess = await prisma.tenantUser.findFirst({
        where: { tenantId: headerTenantId, userId: payload.userId, isActive: true },
        select: { id: true },
      });
      if (!hasAccess) {
        return c.json(new ForbiddenError('Bu tenant\'a erişiminiz yok.').toJSON(), 403);
      }
    }

    c.set('userId', payload.userId);
    c.set('tenantId', tenantId);

    await next();
  } catch {
    return c.json(new ForbiddenError('Geçersiz veya süresi dolmuş token.').toJSON(), 401);
  }
}
