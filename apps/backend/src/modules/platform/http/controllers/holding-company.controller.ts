import { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { getHoldingCompany } from '../../../../services/holding-company.service.js';
import { requireTenantId } from '../../../../utils/context.js';

export const HoldingCompanyController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const data = await getHoldingCompany(prisma, { tenantId });
    return c.json({ data });
  },
};
