import { Hono } from 'hono';
import { MobileDashboardController } from '../modules/platform/http/controllers/mobile-dashboard.controller.js';

const mobileDashboardRoutes = new Hono();

mobileDashboardRoutes.get('/', MobileDashboardController.getDashboard);

export { mobileDashboardRoutes };
