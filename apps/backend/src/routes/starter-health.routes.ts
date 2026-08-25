import { Hono } from 'hono';
import { requirePermission } from '../middleware/requirePermission.js';
import { StarterHealthController } from '../modules/platform/http/controllers/index.js';

const starterHealthRoutes = new Hono();

starterHealthRoutes.get('/status', requirePermission('settings', 'READ'), StarterHealthController.getStatus);

export { starterHealthRoutes };
