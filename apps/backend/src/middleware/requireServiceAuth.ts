import { Context, Next } from 'hono';
import { verifyServiceJwt, ServiceScope } from '../lib/service-jwt';
import { ForbiddenError } from '../errors';

/**
 * Service JWT doğrulama middleware'i.
 * n8n gibi internal servislerden gelen istekleri doğrular.
 *
 * Normal requireAuth'dan farkı:
 * - type: 'service' kontrolü yapar
 * - Scope kontrolü yapar
 * - tenantId her zaman JWT'den alınır (query/body'den ASLA)
 */
export function requireServiceAuth(...requiredScopes: ServiceScope[]) {
  return async (c: Context, next: Next) => {
    const auth = c.req.header('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return c.json(new ForbiddenError('Service token gerekli.').toJSON(), 401);
    }

    const token = auth.slice(7);
    const payload = verifyServiceJwt(token);

    if (!payload) {
      return c.json(new ForbiddenError('Geçersiz veya süresi dolmuş service token.').toJSON(), 401);
    }

    // Scope kontrolü
    if (requiredScopes.length > 0) {
      const hasScope = requiredScopes.every((s) => payload.scopes.includes(s));
      if (!hasScope) {
        return c.json(
          new ForbiddenError(`Yetersiz yetki. Gerekli scope: ${requiredScopes.join(', ')}`).toJSON(),
          403,
        );
      }
    }

    // Context'e set et — controller'lar buradan alacak
    c.set('userId', payload.userId);
    c.set('tenantId', payload.tenantId);
    c.set('serviceScopes', payload.scopes);

    await next();
  };
}
