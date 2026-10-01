import { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { getCapacityPlanning } from '../../infrastructure/services/capacity-planning.service.js';
import { requireTenantId } from '../../../../utils/context.js';
import { ValidationError } from '../../../../errors/index.js';

function parseHorizonDays(value: string | undefined): number {
  if (value === undefined) return 14;
  if (!/^\d+$/.test(value)) throw new ValidationError('horizonDays tam say\u0131 olmal\u0131d\u0131r.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 7 || parsed > 90) {
    throw new ValidationError('horizonDays 7 ile 90 aras\u0131nda olmal\u0131d\u0131r.');
  }
  return parsed;
}

export const CapacityPlanningController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const horizonDays = parseHorizonDays(c.req.query('horizonDays'));
    const data = await getCapacityPlanning(prisma, { tenantId, horizonDays });
    return c.json({ data });
  },
};
