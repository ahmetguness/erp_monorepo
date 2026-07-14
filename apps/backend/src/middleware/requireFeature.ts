import { Context, Next } from 'hono';
import { FeatureKey } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError } from '../errors';
import { TenantFeatureService } from '../services/tenant-feature.service';
import { allowReadOnlyOrRejectDowngradeLock } from '../services/plan-downgrade-access.service';
import { rejectInactiveTenant } from './tenant-status';

// ─────────────────────────────────────────────
// requireFeature Middleware
// Tenant'ın belirli bir feature'a erişimi olup olmadığını kontrol eder.
// ─────────────────────────────────────────────

const tenantFeatureService = new TenantFeatureService(prisma);

/**
 * Kullanım: app.use('/api/...', requireFeature(FeatureKey.API_ACCESS))
 */
export function requireFeature(featureKey: FeatureKey) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const tenantId = c.get('tenantId');

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

    const inactiveTenantResponse = rejectInactiveTenant(c, tenant);
    if (inactiveTenantResponse) return inactiveTenantResponse;

    const isEnabled = await tenantFeatureService.isFeatureEnabled(tenantId, featureKey);

    if (!isEnabled) {
      const lockResponse = allowReadOnlyOrRejectDowngradeLock(c, {
        reason: 'feature',
        currentPlan: tenant.plan,
        featureKey,
      });
      if (lockResponse) return lockResponse;
      await next();
      return;
    }

    await next();
  };
}
