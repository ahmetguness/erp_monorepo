import { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { getQualityControl } from '../../infrastructure/services/quality-control.service.js';
import { requireTenantId } from '../../../../utils/context.js';
import { ValidationError } from '../../../../errors/index.js';

function parseHorizonDays(value: string | undefined): number {
  if (value === undefined) return 30;
  if (!/^\d+$/.test(value)) throw new ValidationError('horizonDays tam say\u0131 olmal\u0131d\u0131r.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 7 || parsed > 180) {
    throw new ValidationError('horizonDays 7 ile 180 aras\u0131nda olmal\u0131d\u0131r.');
  }
  return parsed;
}

export const QualityControlController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const horizonDays = parseHorizonDays(c.req.query('horizonDays'));
    const data = await getQualityControl(prisma, { tenantId, horizonDays });
    return c.json({ data });
  },
};
