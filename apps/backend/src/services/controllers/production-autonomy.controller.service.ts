import { Context } from 'hono';
import { prisma } from '../../lib/prisma.js';
import { requireTenantId, requireUserId } from '../../utils/context.js';
import { ProductionAutonomyService } from '../production-autonomy.service.js';

const productionService = new ProductionAutonomyService(prisma);

export const ProductionAutonomyController = {
  async getCapacityAnalysis(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const data = await productionService.getWorkCenterCapacityAnalysis(tenantId);
    return c.json({ data });
  },

  async optimizeSchedule(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = await c.req.json<{ autoReschedule?: boolean }>().catch(() => ({ autoReschedule: true }));

    const data = await productionService.runAutonomousScheduleOptimization(tenantId, body.autoReschedule ?? true);
    return c.json({ data });
  },

  async getPredictiveMaintenance(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const data = await productionService.getPredictiveMaintenanceReservations(tenantId);
    return c.json({ data });
  },

  async reserveMaintenanceParts(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<{ workCenterId: string; productId: string; quantity: number }>();

    const data = await productionService.dispatchPredictiveMaintenanceReservation(
      tenantId,
      userId,
      body.workCenterId,
      body.productId,
      body.quantity,
    );
    return c.json({ data });
  },
};
