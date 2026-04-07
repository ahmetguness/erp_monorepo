import { Hono } from 'hono';
import { DemoController } from '../controllers/demo.controller';

/** Public route – JWT gerektirmez */
export const demoPublicRoutes = new Hono();
demoPublicRoutes.post('/demo-requests', DemoController.create);

/** Admin route – admin panelinden yönetim */
export const demoAdminRoutes = new Hono();
demoAdminRoutes.get('/demo-requests', DemoController.list);
demoAdminRoutes.get('/demo-requests/:id', DemoController.getById);
demoAdminRoutes.post('/demo-requests/:id/approve', DemoController.approve);
demoAdminRoutes.post('/demo-requests/:id/reject', DemoController.reject);
