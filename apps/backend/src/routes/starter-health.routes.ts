import { Hono } from 'hono';
import { StarterHealthController } from '../controllers/starter-health.controller.js';
import { requirePermission } from '../middleware/requirePermission.js';

const starterHealthRoutes = new Hono();

starterHealthRoutes.get('/status', requirePermission('settings', 'READ'), StarterHealthController.getStatus);

export { starterHealthRoutes };
