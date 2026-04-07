import { Hono } from 'hono';
import { DemoController } from '../controllers/demo.controller';
import { requireAdmin } from '../middleware/requireAdmin';

/** Public route – JWT gerektirmez */
export const demoPublicRoutes = new Hono();
demoPublicRoutes.post('/demo-requests', DemoController.create);

/** Admin route – admin panelinden yönetim */
export const demoAdminRoutes = new Hono();
demoAdminRoutes.get('/demo-requests', requireAdmin, DemoController.list);
demoAdminRoutes.get('/demo-requests/:id', requireAdmin, DemoController.getById);
demoAdminRoutes.post('/demo-requests/:id/approve', requireAdmin, DemoController.approve);
demoAdminRoutes.post('/demo-requests/:id/reject', requireAdmin, DemoController.reject);
