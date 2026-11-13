import { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { getQualityControl } from '../../infrastructure/services/quality-control.service.js';
import { requireParam, requireTenantId, requireUserId } from '../../../../utils/context.js';
import { decideWorkOrderQuality } from '../../infrastructure/services/quality-decision.service.js';
import { qualityDecisionSchema } from '../../application/operations/quality-decision.js';
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
  async decide(c: Context): Promise<Response> {
    const parsed = qualityDecisionSchema.safeParse(await c.req.json<unknown>());
    if (!parsed.success) throw new ValidationError('Invalid quality decision.');
    const data = await decideWorkOrderQuality(prisma, requireTenantId(c), requireUserId(c), requireParam(c, 'id'), parsed.data);
    return c.json({ data });
  },
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const horizonDays = parseHorizonDays(c.req.query('horizonDays'));
    const data = await getQualityControl(prisma, { tenantId, horizonDays });
    return c.json({ data });
  },
};
