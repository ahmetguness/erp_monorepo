import { Context } from 'hono';
import { prisma } from '../../lib/prisma.js';
import { requireTenantId, requireUserId } from '../../utils/context.js';
import { ProcurementAutonomyService } from '../procurement-autonomy.service.js';

const procurementService = new ProcurementAutonomyService(prisma);

export const ProcurementAutonomyController = {
  async getProjections(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const data = await procurementService.getProcurementProjections(tenantId);
    return c.json({ data });
  },

  async getSuppliers(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const data = await procurementService.getSupplierReliabilityScores(tenantId);
    return c.json({ data });
  },

  async dispatchPo(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<{ productId: string; autoDispatch?: boolean }>();

    const data = await procurementService.dispatchZeroTouchPurchaseOrder(
      tenantId,
      userId,
      body.productId,
      body.autoDispatch ?? true,
    );
    return c.json({ data });
  },

  async runScan(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<{ autoDispatch?: boolean }>().catch(() => ({ autoDispatch: true }));

    const data = await procurementService.runAutonomousProcurementScan(
      tenantId,
      userId,
      body.autoDispatch ?? true,
    );
    return c.json({ data });
  },
};
