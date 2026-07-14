import { Context, Next } from 'hono';
import { prisma } from '../lib/prisma';
import { ForbiddenError } from '../errors';
import { ModuleKey } from '../types/module.types';
import { allowReadOnlyOrRejectDowngradeLock } from '../services/plan-downgrade-access.service';
import { hasTenantModuleAccess } from '../utils/tenant-modules';
import { rejectInactiveTenant } from './tenant-status';

export function requireModule(module: ModuleKey) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const tenantId = c.get('tenantId');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimligi bulunamadi.').toJSON(), 403);
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, modules: true, status: true },
    });

    if (!tenant) {
      return c.json(new ForbiddenError('Tenant bulunamadi.').toJSON(), 403);
    }

    const inactiveTenantResponse = rejectInactiveTenant(c, tenant);
    if (inactiveTenantResponse) return inactiveTenantResponse;

    if (!hasTenantModuleAccess(tenant, module)) {
      const lockResponse = allowReadOnlyOrRejectDowngradeLock(c, {
        reason: 'module',
        currentPlan: tenant.plan,
        module,
      });
      if (lockResponse) return lockResponse;
      await next();
      return;
    }

    await next();
  };
}
