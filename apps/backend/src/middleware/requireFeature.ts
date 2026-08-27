import { FeatureKey } from '@prisma/client';
import { Context, Next } from 'hono';
import { ForbiddenError } from '../errors';
import { isAccessFeatureEnabled } from '../modules/identity/application/index.js';
import { allowReadOnlyOrRejectDowngradeLock } from '../services/plan-downgrade-access.service';
import { getAccessContext } from './access-context.js';
import { rejectInactiveTenant } from './tenant-status';

export function requireFeature(featureKey: FeatureKey) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const accessContext = getAccessContext(c);
    if (!accessContext) return c.json(new ForbiddenError('Tenant kimligi bulunamadi.').toJSON(), 403);
    const tenant = accessContext.tenant;
    const inactiveResponse = rejectInactiveTenant(c, tenant);
    if (inactiveResponse) return inactiveResponse;
    if (!isAccessFeatureEnabled(accessContext, featureKey)) {
      const lockResponse = allowReadOnlyOrRejectDowngradeLock(c, { reason: 'feature', currentPlan: tenant.plan, featureKey });
      if (lockResponse) return lockResponse;
    }
    await next();
  };
}
