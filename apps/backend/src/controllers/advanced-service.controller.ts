import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../utils/context.js';
import { getAdvancedService } from '../services/advanced-service.service.js';

function parseHorizonDays(value: string | undefined): number {
  const parsed = Number(value ?? 30);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(180, Math.max(7, Math.trunc(parsed)));
}

export const AdvancedServiceController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const horizonDays = parseHorizonDays(c.req.query('horizonDays'));
    const data = await getAdvancedService(prisma, { tenantId, horizonDays });
    return c.json({ data });
  },
};
