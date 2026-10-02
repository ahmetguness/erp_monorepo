import { Prisma } from '@prisma/client';
import { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { ValidationError } from '../../../../errors/index.js';
import { getValidatedBody } from '../../../../middleware/validateBody.js';
import { executeFinancialAutonomyActionBodySchema } from '../../../../schemas/request-body.schemas.js';
import type { ExecuteFinancialAutonomyActionBody } from '../../../../schemas/request-body.schemas.js';
import { FinancialAutonomyService } from '../../../../services/financial-autonomy.service.js';
import { requireParam,requireTenantId,requireUserId } from '../../../../utils/context.js';

const autonomyService = new FinancialAutonomyService(prisma);

export const FinancialAutonomyController = {
  async getCashFlowForecast(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const daysParam = c.req.query('days');
    const days = daysParam ? parseInt(daysParam, 10) : 30;
    if (!Number.isInteger(days) || days < 1 || days > 365 || (daysParam !== undefined && String(days) !== daysParam)) {
      throw new ValidationError('days 1-365 arasinda tam sayi olmalidir.');
    }

    const data = await autonomyService.getCashFlowForecast(tenantId, days);
    return c.json({ data });
  },

  async getContactVelocity(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const contactId = requireParam(c, 'contactId');

    const data = await autonomyService.getContactPaymentVelocity(tenantId, contactId);
    return c.json({ data });
  },

  async generateCollectionSettlement(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const invoiceId = requireParam(c, 'invoiceId');

    const data = await autonomyService.generateAutonomousCollectionSettlement(tenantId, invoiceId);
    return c.json({ data });
  },

  async getRecommendations(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const data = await autonomyService.getLiquidityBalancingRecommendations(tenantId);
    return c.json({ data });
  },

  async executeAction(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = getValidatedBody<ExecuteFinancialAutonomyActionBody>(c, executeFinancialAutonomyActionBodySchema);

    const result = await autonomyService.executeFinancialAutonomyAction(
      tenantId,
      userId,
      body.actionType,
      (body.payload ?? {}) as Prisma.JsonObject,
    );
    return c.json({ data: result });
  },
};
