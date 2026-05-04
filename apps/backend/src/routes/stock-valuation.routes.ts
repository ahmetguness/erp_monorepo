import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { StockValuationController } from '../controllers/stock-valuation.controller';

const stockValuationRoutes = new Hono();

stockValuationRoutes.use('*', requirePlan(Plan.PROFESSIONAL));

stockValuationRoutes.get('/', StockValuationController.list);
stockValuationRoutes.post('/', StockValuationController.create);

export { stockValuationRoutes };
