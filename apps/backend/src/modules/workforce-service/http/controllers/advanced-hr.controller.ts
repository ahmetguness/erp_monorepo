import { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { getAdvancedHr } from '../../../../services/advanced-hr.service.js';
import { requireTenantId } from '../../../../utils/context.js';

export const AdvancedHrController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const data = await getAdvancedHr(prisma, { tenantId });
    return c.json({ data });
  },
};
