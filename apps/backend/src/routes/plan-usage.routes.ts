import { Hono } from 'hono';
import { requirePermission } from '../middleware/requirePermission';
import { PlanUsageController } from '../modules/platform/http/controllers/index.js';

const planUsageRoutes = new Hono();

planUsageRoutes.get('/', requirePermission('settings', 'READ'), PlanUsageController.summary);

export { planUsageRoutes };
