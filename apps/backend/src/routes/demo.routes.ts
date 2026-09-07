import { Hono } from 'hono';
import { requireAdmin, requireAdminPermission, requireRecentAdminMfa } from '../middleware/requireAdmin';
import { DemoController } from '../modules/platform/http/controllers/index.js';

/** Public route – JWT gerektirmez */
export const demoPublicRoutes = new Hono();
demoPublicRoutes.post('/demo-requests', DemoController.create);

/** Admin route – admin panelinden yönetim */
export const demoAdminRoutes = new Hono();
demoAdminRoutes.get('/demo-requests', requireAdmin, requireAdminPermission('demo.read'), DemoController.list);
demoAdminRoutes.get('/demo-requests/:id', requireAdmin, requireAdminPermission('demo.read'), DemoController.getById);
demoAdminRoutes.post('/demo-requests/:id/approve', requireAdmin, requireAdminPermission('demo.approve'), requireRecentAdminMfa, DemoController.approve);
demoAdminRoutes.post('/demo-requests/:id/reject', requireAdmin, requireAdminPermission('demo.reject'), requireRecentAdminMfa, DemoController.reject);
