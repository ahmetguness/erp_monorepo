import { Hono } from 'hono';
import { requirePermission } from '../middleware/requirePermission';
import { PlanUsageController } from '../controllers/plan-usage.controller';

const planUsageRoutes = new Hono();

planUsageRoutes.get('/', requirePermission('settings', 'READ'), PlanUsageController.summary);

export { planUsageRoutes };
