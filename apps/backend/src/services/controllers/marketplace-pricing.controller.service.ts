import { Context } from 'hono';
import { prisma } from '../../lib/prisma.js';
import { requireTenantId, requireUserId } from '../../utils/context.js';
import { MarketplacePricingAutonomyService } from '../marketplace-pricing-autonomy.service.js';

const pricingService = new MarketplacePricingAutonomyService(prisma);

export const MarketplacePricingController = {
  async getRepricingAnalysis(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const data = await pricingService.getRepricingAnalysis(tenantId);
    return c.json({ data });
  },

  async executeReprice(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<{ listingId: string; targetPrice?: number }>();

    const data = await pricingService.executeDynamicRepricing(tenantId, userId, body.listingId, body.targetPrice);
    return c.json({ data });
  },

  async getStockAllocations(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const data = await pricingService.getInterChannelStockAllocations(tenantId);
    return c.json({ data });
  },

  async reallocateStock(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<{ productId: string }>();

    const data = await pricingService.executeStockReallocation(tenantId, userId, body.productId);
    return c.json({ data });
  },

  async runBatchScan(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<{ autoApply?: boolean }>().catch(() => ({ autoApply: true }));

    const data = await pricingService.runBatchRepricingScan(tenantId, userId, body.autoApply ?? true);
    return c.json({ data });
  },
};
