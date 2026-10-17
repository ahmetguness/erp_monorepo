import { Hono } from "hono";
import { MobileDashboardController } from "../modules/platform/http/controllers/index.js";

const mobileDashboardRoutes = new Hono();

mobileDashboardRoutes.get("/", MobileDashboardController.getDashboard);

export { mobileDashboardRoutes };
