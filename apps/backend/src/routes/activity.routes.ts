import { Hono } from 'hono';
import { requirePermission } from '../middleware/requirePermission';
import { ActivityController } from '../modules/platform/http/controllers/index.js';

const activityRoutes = new Hono();

activityRoutes.get('/', requirePermission('audit_logs', 'READ'), ActivityController.list);

export { activityRoutes };
