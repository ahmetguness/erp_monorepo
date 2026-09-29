import { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { ProcurementAutonomyService } from '../../../../services/procurement-autonomy.service.js';
import { ReplenishmentPlanningService } from '../../application/replenishment/index.js';
import { PrismaReplenishmentRepository } from '../../infrastructure/persistence/index.js';
import { parseProcurementDispatch, parseProcurementScan, parseReplenishmentPolicy } from '../schemas/replenishment-policy.schema.js';
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
    const body = parseProcurementDispatch(await c.req.json<unknown>().catch(() => null));
    if (!body) return c.json(new ValidationError('Geçerli bir productId zorunludur; otomatik gönderim desteklenmez.').toJSON(), 400);

    const data = await procurementService.dispatchZeroTouchPurchaseOrder(
      tenantId,
      userId,
      body.productId,
      false,
    );
    return c.json({ data });
  },

  async runScan(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = parseProcurementScan(await c.req.json<unknown>().catch(() => ({})));
    if (!body) return c.json(new ValidationError('Otomatik gönderim desteklenmez; siparişler taslak oluşturulur.').toJSON(), 400);

    const data = await procurementService.runAutonomousProcurementScan(
      tenantId,
      userId,
      false,
    );
    return c.json({ data });
  },
};
