import { Hono } from "hono";
import { ACCESS_POLICIES } from "@repo/types/plans";
import { requireAccess } from "../middleware/requireAccess";
import { requirePermission } from "../middleware/requirePermission";
import { MarketplacePricingController } from "../modules/marketplace/http/controllers/index.js";

const marketplacePricingRoutes = new Hono();

marketplacePricingRoutes.use("*", requireAccess(ACCESS_POLICIES.marketplace));

marketplacePricingRoutes.get(
  "/repricing-analysis",
  requirePermission("marketplace", "READ"),
  MarketplacePricingController.getRepricingAnalysis,
);
marketplacePricingRoutes.post(
  "/execute-reprice",
  requirePermission("marketplace", "UPDATE"),
  MarketplacePricingController.executeReprice,
);
marketplacePricingRoutes.get(
  "/stock-allocations",
  requirePermission("marketplace", "READ"),
  MarketplacePricingController.getStockAllocations,
);
marketplacePricingRoutes.post(
  "/reallocate-stock",
  requirePermission("marketplace", "UPDATE"),
  MarketplacePricingController.reallocateStock,
);
marketplacePricingRoutes.post(
  "/run-batch-scan",
  requirePermission("marketplace", "UPDATE"),
  MarketplacePricingController.runBatchScan,
);

export { marketplacePricingRoutes };
