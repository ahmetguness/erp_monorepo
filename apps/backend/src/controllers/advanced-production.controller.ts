import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../utils/context.js';
import { getAdvancedProduction } from '../services/advanced-production.service.js';

function parseHorizonDays(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '30', 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(180, Math.max(7, parsed));
}

export const AdvancedProductionController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const horizonDays = parseHorizonDays(c.req.query('horizonDays'));
    const data = await getAdvancedProduction(prisma, { tenantId, horizonDays });
    return c.json({ data });
  },
};
