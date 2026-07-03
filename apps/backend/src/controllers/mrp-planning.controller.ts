import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../utils/context.js';
import { getMrpPlanning } from '../services/mrp-planning.service.js';

function parseHorizonDays(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '30', 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(180, Math.max(7, parsed));
}

export const MrpPlanningController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const horizonDays = parseHorizonDays(c.req.query('horizonDays'));
    const data = await getMrpPlanning(prisma, { tenantId, horizonDays });
    return c.json({ data });
  },
};
