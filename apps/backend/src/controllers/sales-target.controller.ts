import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { getValidatedBody } from '../middleware/validateBody';
import { salesTargetBodySchema } from '../schemas/request-body.schemas';
import { currentMonthKey, SalesTargetService } from '../services/sales-target.service';
import { requireTenantId } from '../utils/context';

const salesTargetService = new SalesTargetService(prisma);

export const SalesTargetController = {
  async getMonthly(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const month = c.req.query('month') ?? currentMonthKey();
    const target = await salesTargetService.getMonthlyTarget(tenantId, month);
    return c.json({ data: target });
  },

  async upsertMonthly(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = getValidatedBody(c, salesTargetBodySchema);
    const target = await salesTargetService.upsertMonthlyTarget(tenantId, body);
    return c.json({ data: target });
  },
};
