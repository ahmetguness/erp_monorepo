import { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { getValidatedBody } from '../../../../middleware/validateBody.js';
import { salesTargetBodySchema } from '../../../../schemas/request-body.schemas.js';
import { currentMonthKey, SalesTargetService } from '../../../../services/sales-target.service.js';
import { requireTenantId } from '../../../../utils/context.js';

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
