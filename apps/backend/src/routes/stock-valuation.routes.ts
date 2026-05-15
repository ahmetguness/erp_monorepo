import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requirePermission } from '../middleware/requirePermission';
import { StockValuationController } from '../controllers/stock-valuation.controller';

const stockValuationRoutes = new Hono();

stockValuationRoutes.use('*', requirePlan(Plan.PROFESSIONAL));

stockValuationRoutes.get('/', requirePermission('inventory', 'READ'), StockValuationController.list);
stockValuationRoutes.post('/', requirePermission('inventory', 'CREATE'), StockValuationController.create);

export { stockValuationRoutes };
