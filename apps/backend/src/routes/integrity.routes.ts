import { Hono } from "hono";
import { IntegrityController } from "../modules/finance/http/controllers/index.js";
import { requirePermission } from "../middleware/requirePermission";

const integrityRoutes = new Hono();

integrityRoutes.post(
  "/scan",
  requirePermission("operations", "UPDATE"),
  IntegrityController.runScan,
);
integrityRoutes.post(
  "/exceptions/:id/resolve",
  requirePermission("operations", "UPDATE"),
  IntegrityController.resolveException,
);

export { integrityRoutes };
