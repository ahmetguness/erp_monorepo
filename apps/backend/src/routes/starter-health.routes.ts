import { Hono } from 'hono';
import { StarterHealthController } from '../modules/platform/http/controllers/index.js';
import { requirePermission } from '../middleware/requirePermission.js';

const starterHealthRoutes = new Hono();

starterHealthRoutes.get('/status', requirePermission('settings', 'READ'), StarterHealthController.getStatus);

export { starterHealthRoutes };
