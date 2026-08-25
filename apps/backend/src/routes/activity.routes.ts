import { Hono } from 'hono';
import { ActivityController } from '../modules/platform/http/controllers/index.js';
import { requirePermission } from '../middleware/requirePermission';

const activityRoutes = new Hono();

activityRoutes.get('/', requirePermission('audit_logs', 'READ'), ActivityController.list);

export { activityRoutes };
