import { Context, Next } from 'hono';
import { FeatureKey, Plan } from '@prisma/client';
import type { AccessPolicy, FeatureKeyName, ModuleKey as SharedModuleKey, PlanName } from '@repo/types/plans';
import { prisma } from '../lib/prisma';
import { FeatureDisabledError, ForbiddenError, ModuleDisabledError, NotFoundError } from '../errors';
import { isPlanAtLeast } from '../types/plan.types';
import { isModuleInList } from '../utils/feature-helpers';
import { TenantFeatureService } from '../services/tenant-feature.service';

const tenantFeatureService = new TenantFeatureService(prisma);

export function requireAccess(policy: AccessPolicy) {
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
      return c.json(new NotFoundError('Tenant', tenantId).toJSON(), 404);
    }

    if (policy.minPlan) {
      const requiredPlan = toPrismaPlan(policy.minPlan);
      if (!isPlanAtLeast(tenant.plan, requiredPlan)) {
        return c.json(
          new ForbiddenError(
            `Bu ozellik icin en az ${requiredPlan} plani gereklidir. Mevcut planiniz: ${tenant.plan}.`,
          ).toJSON(),
          403,
        );
      }
      c.set('tenantPlan', tenant.plan);
    }

    if (policy.featureKey) {
      const featureKey = toPrismaFeatureKey(policy.featureKey);
      const isEnabled = await tenantFeatureService.isFeatureEnabled(tenantId, featureKey);
      if (!isEnabled) {
        return c.json(new FeatureDisabledError(featureKey).toJSON(), 403);
      }
    }

    if (policy.module && !isModuleInList(tenant.modules, policy.module)) {
      return c.json(new ModuleDisabledError(policy.module).toJSON(), 403);
    }

    await next();
  };
}

function toPrismaPlan(plan: PlanName): Plan {
  return Plan[plan];
}

function toPrismaFeatureKey(featureKey: FeatureKeyName): FeatureKey {
  return FeatureKey[featureKey];
}

export type { SharedModuleKey as AccessModuleKey };
