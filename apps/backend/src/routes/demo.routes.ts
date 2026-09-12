import { Hono } from 'hono';
import { requireAdmin, requireAdminPermission, requireRecentAdminMfa } from '../middleware/requireAdmin';
import { DemoController } from '../modules/platform/http/controllers/index.js';
import { platformAdminAuditMiddleware } from '../middleware/platform-admin-audit.js';
import { adminIdempotency } from '../middleware/admin-idempotency.js';

/** Public route – JWT gerektirmez */
export const demoPublicRoutes = new Hono();
demoPublicRoutes.post('/demo-requests', DemoController.create);

/** Admin route – admin panelinden yönetim */
export const demoAdminRoutes = new Hono();
demoAdminRoutes.use('*', requireAdmin);
demoAdminRoutes.use('*', adminIdempotency);
demoAdminRoutes.use('*', platformAdminAuditMiddleware);
demoAdminRoutes.get('/demo-requests', requireAdmin, requireAdminPermission('demo.read'), DemoController.list);
demoAdminRoutes.get('/demo-requests/:id/preview', requireAdmin, requireAdminPermission('demo.approve'), DemoController.preview);
demoAdminRoutes.get('/demo-requests/:id', requireAdmin, requireAdminPermission('demo.read'), DemoController.getById);
demoAdminRoutes.post('/demo-requests/:id/approve', requireAdmin, requireAdminPermission('demo.approve'), requireRecentAdminMfa, DemoController.approve);
demoAdminRoutes.post('/demo-requests/:id/reject', requireAdmin, requireAdminPermission('demo.reject'), requireRecentAdminMfa, DemoController.reject);
demoAdminRoutes.post('/demo-requests/:id/assign', requireAdmin, requireAdminPermission('demo.approve'), requireRecentAdminMfa, DemoController.assign);
demoAdminRoutes.post('/demo-requests/:id/notes', requireAdmin, requireAdminPermission('demo.approve'), requireRecentAdminMfa, DemoController.addNote);
