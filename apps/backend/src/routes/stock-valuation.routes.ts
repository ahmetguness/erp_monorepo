import { Hono } from 'hono';
import { requirePlan } from '../middleware/requirePlan';
import { StockValuationController } from '../controllers/stock-valuation.controller';

const stockValuationRoutes = new Hono();

stockValuationRoutes.use('*', requirePlan('PROFESSIONAL'));

stockValuationRoutes.get('/', StockValuationController.list);
stockValuationRoutes.post('/', StockValuationController.create);

export { stockValuationRoutes };
