import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../utils/context.js';
import { getHoldingCompany } from '../services/holding-company.service.js';

export const HoldingCompanyController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const data = await getHoldingCompany(prisma, { tenantId });
    return c.json({ data });
  },
};
