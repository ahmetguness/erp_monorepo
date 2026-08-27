import { Context, Next } from 'hono';
import { ForbiddenError } from '../errors';
import { allowReadOnlyOrRejectDowngradeLock } from '../services/plan-downgrade-access.service';
import { ModuleKey } from '../types/module.types';
import { hasTenantModuleAccess } from '../utils/tenant-modules';
import { getAccessContext } from './access-context.js';
import { rejectInactiveTenant } from './tenant-status';

export function requireModule(module: ModuleKey) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const accessContext = getAccessContext(c);
    if (!accessContext) return c.json(new ForbiddenError('Tenant kimligi bulunamadi.').toJSON(), 403);
    const tenant = accessContext.tenant;
    const inactiveResponse = rejectInactiveTenant(c, tenant);
    if (inactiveResponse) return inactiveResponse;
    if (!hasTenantModuleAccess(tenant, module)) {
      const lockResponse = allowReadOnlyOrRejectDowngradeLock(c, { reason: 'module', currentPlan: tenant.plan, module });
      if (lockResponse) return lockResponse;
    }
    await next();
  };
}
