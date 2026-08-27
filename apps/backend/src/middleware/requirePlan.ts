import { Plan } from '@prisma/client';
import { Context, Next } from 'hono';
import { ForbiddenError } from '../errors';
import { allowReadOnlyOrRejectDowngradeLock } from '../services/plan-downgrade-access.service';
import { isPlanAtLeast } from '../types/plan.types';
import { getAccessContext } from './access-context.js';
import { rejectInactiveTenant } from './tenant-status';

export function requirePlan(minimumPlan: Plan) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const accessContext = getAccessContext(c);
    if (!accessContext) return c.json(new ForbiddenError('Tenant kimligi bulunamadi.').toJSON(), 403);
    const tenant = accessContext.tenant;
    const inactiveResponse = rejectInactiveTenant(c, tenant);
    if (inactiveResponse) return inactiveResponse;
    if (!isPlanAtLeast(tenant.plan, minimumPlan)) {
      const lockResponse = allowReadOnlyOrRejectDowngradeLock(c, { reason: 'plan', currentPlan: tenant.plan, requiredPlan: minimumPlan });
      if (lockResponse) return lockResponse;
    }
    c.set('tenantPlan', tenant.plan);
    await next();
  };
}
