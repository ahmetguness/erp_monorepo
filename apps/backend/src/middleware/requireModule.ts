import { Context, Next } from 'hono';
import { prisma } from '../lib/prisma';
import { ModuleDisabledError, ForbiddenError } from '../errors';
import { ModuleKey } from '../types/module.types';
import { hasTenantModuleAccess } from '../utils/tenant-modules';

export function requireModule(module: ModuleKey) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const tenantId = c.get('tenantId');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimligi bulunamadi.').toJSON(), 403);
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, modules: true },
    });

    if (!tenant) {
      return c.json(new ForbiddenError('Tenant bulunamadi.').toJSON(), 403);
    }

    if (!hasTenantModuleAccess(tenant, module)) {
      return c.json(new ModuleDisabledError(module).toJSON(), 403);
    }

    await next();
  };
}
