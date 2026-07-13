import type { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { PlanUsageService } from '../services/plan-usage.service';
import { requireTenantId } from '../utils/context.js';

const planUsageService = new PlanUsageService(prisma);

export const PlanUsageController = {
  async summary(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const summary = await planUsageService.getSummary(tenantId);
    return c.json({ data: summary });
  },
};
