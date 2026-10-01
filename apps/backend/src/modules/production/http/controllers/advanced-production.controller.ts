import { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { getAdvancedProduction } from '../../infrastructure/services/advanced-production.service.js';
import { requireTenantId } from '../../../../utils/context.js';
import { ValidationError } from '../../../../errors/index.js';

function parseHorizonDays(value: string | undefined): number {
  if (value === undefined) return 30;
  if (!/^\d+$/.test(value)) throw new ValidationError('horizonDays tam sayı olmalıdır.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 7 || parsed > 180) {
    throw new ValidationError('horizonDays 7 ile 180 arasında olmalıdır.');
  }
  return parsed;
}

export const AdvancedProductionController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const horizonDays = parseHorizonDays(c.req.query('horizonDays'));
    const data = await getAdvancedProduction(prisma, { tenantId, horizonDays });
    return c.json({ data });
  },
};
