import { Context, Next } from 'hono';
import { Plan } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError } from '../errors';
import { isPlanAtLeast } from '../types/plan.types';

// ─────────────────────────────────────────────
// requirePlan Middleware
// Tenant'ın belirli bir plana sahip olup olmadığını kontrol eder.
// ─────────────────────────────────────────────

/**
 * Kullanım: app.use('/api/...', requirePlan(Plan.PROFESSIONAL))
 */
export function requirePlan(minimumPlan: Plan) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, status: true },
    });

    if (!tenant) {
      return c.json(new NotFoundError('Tenant', tenantId).toJSON(), 404);
    }

    if (!isPlanAtLeast(tenant.plan, minimumPlan)) {
      return c.json(
        new ForbiddenError(
          `Bu özellik için en az ${minimumPlan} planı gereklidir. Mevcut planınız: ${tenant.plan}.`,
        ).toJSON(),
        403,
      );
    }

    c.set('tenantPlan', tenant.plan);
    await next();
  };
}
