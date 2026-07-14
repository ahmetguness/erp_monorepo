import { Context, Next } from 'hono';
import { Plan } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError } from '../errors';
import { allowReadOnlyOrRejectDowngradeLock } from '../services/plan-downgrade-access.service';
import { isPlanAtLeast } from '../types/plan.types';
import { rejectInactiveTenant } from './tenant-status';

export function requirePlan(minimumPlan: Plan) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const tenantId = c.get('tenantId');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimligi bulunamadi.').toJSON(), 403);
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, status: true },
    });

    if (!tenant) {
      return c.json(new NotFoundError('Tenant', tenantId).toJSON(), 404);
    }

    const inactiveTenantResponse = rejectInactiveTenant(c, tenant);
    if (inactiveTenantResponse) return inactiveTenantResponse;

    if (!isPlanAtLeast(tenant.plan, minimumPlan)) {
      const lockResponse = allowReadOnlyOrRejectDowngradeLock(c, {
        reason: 'plan',
        currentPlan: tenant.plan,
        requiredPlan: minimumPlan,
      });
      if (lockResponse) return lockResponse;
      c.set('tenantPlan', tenant.plan);
      await next();
      return;
    }

    c.set('tenantPlan', tenant.plan);
    await next();
  };
}
