import type { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { TenantFeatureService } from '../../../../services/tenant-feature.service.js';
import { requireTenantId } from '../../../../utils/context.js';

const tenantFeatureService = new TenantFeatureService(prisma);

export const FeatureController = {
  async resolved(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const features = await tenantFeatureService.resolveAllFeatures(tenantId);
    return c.json({ data: features });
  },
};
