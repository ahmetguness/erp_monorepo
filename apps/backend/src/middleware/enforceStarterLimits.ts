import { Context, Next } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { prisma } from '../lib/prisma';
import { ForbiddenError, LimitExceededError } from '../errors';
import { StarterAccessService } from '../services/starter-access.service';

// ─────────────────────────────────────────────
// enforceStarterLimits Middleware
// Starter plan limitlerini (user, product, warehouse) enforce eder.
// ─────────────────────────────────────────────

const starterAccessService = new StarterAccessService(prisma);

export type StarterLimitType = 'user' | 'product' | 'warehouse' | 'warehouse_transfer';

/**
 * Kullanım:
 *   app.post('/api/users', enforceStarterLimits('user'), ...)
 *   app.post('/api/products', enforceStarterLimits('product'), ...)
 *   app.post('/api/warehouses', enforceStarterLimits('warehouse'), ...)
 */
export function enforceStarterLimits(limitType: StarterLimitType) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    try {
      switch (limitType) {
        case 'user':
          await starterAccessService.enforceUserLimit(tenantId);
          break;
        case 'product':
          await starterAccessService.enforceProductLimit(tenantId);
          break;
        case 'warehouse':
          await starterAccessService.enforceWarehouseCreation(tenantId);
          break;
        case 'warehouse_transfer':
          await starterAccessService.enforceWarehouseTransfer(tenantId);
          break;
        default: {
          const _exhaustive: never = limitType;
          return c.json(
            new ForbiddenError(`Bilinmeyen limit tipi: ${_exhaustive}`).toJSON(),
            403,
          );
        }
      }
    } catch (err) {
      if (err instanceof LimitExceededError) {
        return c.json(err.toJSON(), err.statusCode as ContentfulStatusCode);
      }
      if (err instanceof ForbiddenError) {
        return c.json(err.toJSON(), err.statusCode as ContentfulStatusCode);
      }
      throw err;
    }

    await next();
  };
}
