import { Hono } from "hono";
import { OperationsController } from "../modules/automation-intelligence/http/controllers/index.js";
import { requirePermission } from "../middleware/requirePermission";

const operationsRoutes = new Hono();

operationsRoutes.get(
  "/health",
  requirePermission("operations", "READ"),
  OperationsController.getHealth,
);
operationsRoutes.get(
  "/timeline/:entityType/:entityId",
  requirePermission("operations", "READ"),
  OperationsController.getTimeline,
);

export { operationsRoutes };
