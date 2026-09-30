import { Hono } from "hono";
import { ACCESS_POLICIES } from "@repo/types/plans";
import { requireAccess } from "../middleware/requireAccess";
import { requirePermission } from "../middleware/requirePermission";
import { ProductionAutonomyController } from "../modules/production/http/controllers/index.js";

const productionAutonomyRoutes = new Hono();
productionAutonomyRoutes.use("*", requireAccess(ACCESS_POLICIES.production));

productionAutonomyRoutes.get(
  "/work-center-capacity",
  requirePermission("production", "READ"),
  ProductionAutonomyController.getCapacityAnalysis,
);
productionAutonomyRoutes.post(
  "/optimize-schedule",
  requirePermission("production", "UPDATE"),
  ProductionAutonomyController.optimizeSchedule,
);
productionAutonomyRoutes.get(
  "/predictive-maintenance",
  requirePermission("production", "READ"),
  ProductionAutonomyController.getPredictiveMaintenance,
);
productionAutonomyRoutes.post(
  "/reserve-maintenance-parts",
  requirePermission("production", "UPDATE"),
  ProductionAutonomyController.reserveMaintenanceParts,
);

export { productionAutonomyRoutes };
