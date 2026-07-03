import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { requireTenantId } from '../utils/context.js';
import { getAdvancedHr } from '../services/advanced-hr.service.js';

export const AdvancedHrController = {
  async get(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const data = await getAdvancedHr(prisma, { tenantId });
    return c.json({ data });
  },
};
