import { Context, Next } from 'hono';
import { FeatureKey } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { FeatureDisabledError, ForbiddenError } from '../errors';
import { TenantFeatureService } from '../services/tenant-feature.service';

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
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const isEnabled = await tenantFeatureService.isFeatureEnabled(tenantId, featureKey);

    if (!isEnabled) {
      return c.json(new FeatureDisabledError(featureKey).toJSON(), 403);
    }

    await next();
  };
}
