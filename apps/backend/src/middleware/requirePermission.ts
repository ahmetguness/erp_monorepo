import { PermissionAction } from '@prisma/client';
import { Context, Next } from 'hono';
import { ForbiddenError } from '../errors';
import { hasAccessPermission } from '../modules/identity/application/index.js';
import { getAccessContext } from './access-context.js';

/** Must run after requireAuth, which resolves the request-scoped access context. */
export function requirePermission(module: string, action: PermissionAction) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const accessContext = getAccessContext(c);
    if (!accessContext) return c.json(new ForbiddenError('Yetkilendirme bilgisi eksik.').toJSON(), 403);
    if (!hasAccessPermission(accessContext, module, action)) {
      return c.json(new ForbiddenError(`Bu islem icin yetkiniz yok (${module}:${action}).`).toJSON(), 403);
    }
    await next();
  };
}
