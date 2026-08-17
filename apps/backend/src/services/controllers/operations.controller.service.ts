import { Context } from 'hono';
import { prisma } from '../../lib/prisma.js';
import { requireTenantId, requireParam } from '../../utils/context.js';
import { OperationsService } from '../operations.service.js';

const operationsService = new OperationsService(prisma);

export const OperationsController = {
  async getHealth(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const data = await operationsService.getOperationsHealth(tenantId);
    return c.json({ data });
  },

  async getTimeline(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const entityType = requireParam(c, 'entityType');
    const entityId = requireParam(c, 'entityId');

    const data = await operationsService.getEntityTimeline(tenantId, entityType, entityId);
    return c.json({ data });
  },
};
