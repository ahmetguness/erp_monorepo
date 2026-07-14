import { Context, Next } from 'hono';
import { FeatureKey, Plan } from '@prisma/client';
import type { AccessPolicy, FeatureKeyName, ModuleKey as SharedModuleKey, PlanName } from '@repo/types/plans';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError } from '../errors';
import { isPlanAtLeast } from '../types/plan.types';
import { TenantFeatureService } from '../services/tenant-feature.service';
import { allowReadOnlyOrRejectDowngradeLock } from '../services/plan-downgrade-access.service';
import { hasTenantModuleAccess } from '../utils/tenant-modules';
import { rejectInactiveTenant } from './tenant-status';

const tenantFeatureService = new TenantFeatureService(prisma);

export function requireAccess(policy: AccessPolicy) {
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
      return c.json(new NotFoundError('Tenant', tenantId).toJSON(), 404);
    }

    const inactiveTenantResponse = rejectInactiveTenant(c, tenant);
    if (inactiveTenantResponse) return inactiveTenantResponse;

    if (policy.minPlan) {
      const requiredPlan = toPrismaPlan(policy.minPlan);
      if (!isPlanAtLeast(tenant.plan, requiredPlan)) {
        const lockResponse = allowReadOnlyOrRejectDowngradeLock(c, {
          reason: 'plan',
          currentPlan: tenant.plan,
          requiredPlan,
          module: policy.module,
          featureKey: policy.featureKey ? toPrismaFeatureKey(policy.featureKey) : undefined,
        });
        if (lockResponse) return lockResponse;
        c.set('tenantPlan', tenant.plan);
        await next();
        return;
      }
      c.set('tenantPlan', tenant.plan);
    }

    if (policy.featureKey) {
      const featureKey = toPrismaFeatureKey(policy.featureKey);
      const isEnabled = await tenantFeatureService.isFeatureEnabled(tenantId, featureKey);
      if (!isEnabled) {
        const lockResponse = allowReadOnlyOrRejectDowngradeLock(c, {
          reason: 'feature',
          currentPlan: tenant.plan,
          module: policy.module,
          featureKey,
        });
        if (lockResponse) return lockResponse;
        await next();
        return;
      }
    }

    if (policy.module && !hasTenantModuleAccess(tenant, policy.module)) {
      const lockResponse = allowReadOnlyOrRejectDowngradeLock(c, {
        reason: 'module',
        currentPlan: tenant.plan,
        module: policy.module,
        featureKey: policy.featureKey ? toPrismaFeatureKey(policy.featureKey) : undefined,
      });
      if (lockResponse) return lockResponse;
      await next();
      return;
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
