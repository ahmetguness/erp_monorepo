import { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { OperationsService } from '../../../../services/operations.service.js';
import { requireParam,requireTenantId } from '../../../../utils/context.js';

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
