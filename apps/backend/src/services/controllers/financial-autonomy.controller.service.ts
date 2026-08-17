import { Context } from 'hono';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { requireTenantId, requireUserId, requireParam } from '../../utils/context.js';
import { FinancialAutonomyService } from '../financial-autonomy.service.js';

const autonomyService = new FinancialAutonomyService(prisma);

export const FinancialAutonomyController = {
  async getCashFlowForecast(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const daysParam = c.req.query('days');
    const days = daysParam ? parseInt(daysParam, 10) : 30;

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
    const body = await c.req.json<{ actionType: string; payload?: Prisma.JsonObject }>();

    const result = await autonomyService.executeFinancialAutonomyAction(
      tenantId,
      userId,
      body.actionType,
      body.payload ?? {},
    );
    return c.json({ data: result });
  },
};
