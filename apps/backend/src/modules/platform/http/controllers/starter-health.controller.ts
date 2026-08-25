import { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { StarterHealthService } from '../../../../services/starter-health.service.js';
import { requireTenantId } from '../../../../utils/context.js';

export const StarterHealthController = {
  async getStatus(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const service = new StarterHealthService(prisma);
    const status = await service.getHealthScore(tenantId);
    return c.json({ data: status });
  },
};
