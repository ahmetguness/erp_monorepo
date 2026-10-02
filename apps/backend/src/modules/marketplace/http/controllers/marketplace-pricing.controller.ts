import { Context } from "hono";
import { prisma } from "../../../../lib/prisma.js";
import { MarketplacePricingAutonomyService } from "../../../../services/marketplace-pricing-autonomy.service.js";
import { requireTenantId, requireUserId } from "../../../../utils/context.js";
import { ValidationError } from "../../../../errors/index.js";

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
    const body = await c.req.json<{
      listingId: string;
      targetPrice?: number;
    }>();
    if (
      !body?.listingId ||
      typeof body.listingId !== "string" ||
      !body.listingId.trim()
    )
      throw new ValidationError("listingId zorunludur.");
    if (
      body.targetPrice !== undefined &&
      (!Number.isFinite(body.targetPrice) ||
        body.targetPrice <= 0 ||
        body.targetPrice > 9999999999999999 ||
        Math.round(body.targetPrice * 100) !== body.targetPrice * 100)
    )
      throw new ValidationError(
        "targetPrice pozitif ve en fazla 2 ondalik olmalidir.",
      );

    const data = await pricingService.executeDynamicRepricing(
      tenantId,
      userId,
      body.listingId,
      body.targetPrice,
    );
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
    if (
      !body?.productId ||
      typeof body.productId !== "string" ||
      !body.productId.trim()
    )
      throw new ValidationError("productId zorunludur.");

    const data = await pricingService.executeStockReallocation(
      tenantId,
      userId,
      body.productId,
    );
    return c.json({ data });
  },

  async runBatchScan(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<{ autoApply?: boolean }>();
    if (body?.autoApply !== undefined && typeof body.autoApply !== "boolean")
      throw new ValidationError("autoApply boolean olmalidir.");

    const data = await pricingService.runBatchRepricingScan(
      tenantId,
      userId,
      body.autoApply ?? true,
    );
    return c.json({ data });
  },
};
