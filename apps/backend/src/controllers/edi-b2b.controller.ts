import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { EdiB2BService } from '../services/edi-b2b.service.js';
import { requireTenantId } from '../utils/context.js';

export const EdiB2BController = {
  async hub(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const data = await new EdiB2BService(prisma).getHub(tenantId);
    return c.json({ data });
  },
};
