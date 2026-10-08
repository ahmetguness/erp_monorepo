import { Hono } from "hono";
import { Plan } from "@prisma/client";
import { requirePlan } from "../middleware/requirePlan";
import { requirePermission } from "../middleware/requirePermission";
import { HoldingCompanyController } from "../modules/platform/http/controllers/index.js";

const enterpriseRoutes = new Hono();

enterpriseRoutes.get(
  "/holding",
  requirePlan(Plan.ENTERPRISE),
  requirePermission("settings", "READ"),
  HoldingCompanyController.get,
);

export { enterpriseRoutes };
