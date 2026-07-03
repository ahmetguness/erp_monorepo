import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../utils/context.js';
import { getCapacityPlanning } from '../services/capacity-planning.service.js';

function parseHorizonDays(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '14', 10);
  if (!Number.isFinite(parsed)) return 14;
  return Math.min(90, Math.max(7, parsed));
}

export const CapacityPlanningController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const horizonDays = parseHorizonDays(c.req.query('horizonDays'));
    const data = await getCapacityPlanning(prisma, { tenantId, horizonDays });
    return c.json({ data });
  },
};
