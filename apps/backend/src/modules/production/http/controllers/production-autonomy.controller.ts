import { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { ProductionAutonomyService } from '../../infrastructure/services/production-autonomy.service.js';
import { requireTenantId,requireUserId } from '../../../../utils/context.js';
import { ValidationError } from '../../../../errors/index.js';

const productionService = new ProductionAutonomyService(prisma);

export const ProductionAutonomyController = {
  async getCapacityAnalysis(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const data = await productionService.getWorkCenterCapacityAnalysis(tenantId);
    return c.json({ data });
  },

  async optimizeSchedule(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body: { autoReschedule?: unknown } = await c.req.json<{ autoReschedule?: unknown }>().catch(() => ({}));
    if (body.autoReschedule !== undefined && typeof body.autoReschedule !== 'boolean') {
      throw new ValidationError('autoReschedule boolean olmalıdır.');
    }

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
    const body = await c.req.json<{ workCenterId?: unknown; productId?: unknown; quantity?: unknown }>();
    const workCenterId = typeof body.workCenterId === 'string' ? body.workCenterId.trim() : '';
    const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
    const quantity = typeof body.quantity === 'number' ? body.quantity : Number.NaN;
    if (!workCenterId || workCenterId.length > 100) throw new ValidationError('Geçerli bir workCenterId zorunludur.');
    if (!productId || productId.length > 100) throw new ValidationError('Geçerli bir productId zorunludur.');
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999_999_999.999 || Math.round(quantity * 1000) !== quantity * 1000) {
      throw new ValidationError('quantity pozitif ve en fazla 3 ondalıklı geçerli bir sayı olmalıdır.');
    }

    const data = await productionService.dispatchPredictiveMaintenanceReservation(
      tenantId,
      userId,
      workCenterId,
      productId,
      quantity,
    );
    return c.json({ data });
  },
};
