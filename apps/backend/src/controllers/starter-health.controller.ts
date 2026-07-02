import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../utils/context.js';
import { StarterHealthService } from '../services/starter-health.service.js';

export const StarterHealthController = {
  async getStatus(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const service = new StarterHealthService(prisma);
    const status = await service.getHealthScore(tenantId);
    return c.json({ data: status });
  },
};
