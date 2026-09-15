import { Hono } from "hono";
import { requirePermission } from "../../../../../middleware/requirePermission.js";
import { BasicDashboardController } from "./basic-dashboard.controller.js";

export const basicDashboardRoutes = new Hono();

basicDashboardRoutes.get(
  "/executive",
  requirePermission("reporting", "READ"),
  BasicDashboardController.executive,
);
basicDashboardRoutes.get(
  "/production",
  requirePermission("production", "READ"),
  BasicDashboardController.production,
);
basicDashboardRoutes.get(
  "/procurement",
  requirePermission("purchasing", "READ"),
  BasicDashboardController.procurement,
);
