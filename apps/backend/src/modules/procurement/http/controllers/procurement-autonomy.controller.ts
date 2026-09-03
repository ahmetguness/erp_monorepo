import { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { ProcurementAutonomyService } from '../../../../services/procurement-autonomy.service.js';
import { ReplenishmentPlanningService } from '../../application/replenishment/index.js';
import { PrismaReplenishmentRepository } from '../../infrastructure/persistence/index.js';
import { parseReplenishmentPolicy } from '../schemas/replenishment-policy.schema.js';
import { requireTenantId,requireUserId } from '../../../../utils/context.js';
import { ValidationError } from '../../../../errors/index.js';

const procurementService = new ProcurementAutonomyService(prisma);
const planningService = new ReplenishmentPlanningService(new PrismaReplenishmentRepository(prisma));

export const ProcurementAutonomyController = {
  async planningWorkspace(c: Context): Promise<Response> { return c.json({ data: await planningService.getWorkspace(requireTenantId(c)) }); },
  async updatePlanningPolicy(c: Context): Promise<Response> {
    const input = parseReplenishmentPolicy(await c.req.json<unknown>().catch(() => null));
    if (!input) return c.json(new ValidationError('İkmal planlama politikası geçersiz.').toJSON(), 400);
    return c.json({ data: await planningService.updatePolicy(requireTenantId(c), input) });
  },
  async runPlanning(c: Context): Promise<Response> { return c.json({ data: await planningService.run(requireTenantId(c), requireUserId(c)) }); },
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
      body.autoDispatch ?? false,
    );
    return c.json({ data });
  },

  async runScan(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<{ autoDispatch?: boolean }>().catch(() => ({ autoDispatch: false }));

    const data = await procurementService.runAutonomousProcurementScan(
      tenantId,
      userId,
      body.autoDispatch ?? false,
    );
    return c.json({ data });
  },
};
