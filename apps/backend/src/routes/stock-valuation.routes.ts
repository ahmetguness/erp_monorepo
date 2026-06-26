import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { StockValuationController } from '../controllers/stock-valuation.controller';

const stockValuationRoutes = new Hono();

stockValuationRoutes.use('*', requireAccess(ACCESS_POLICIES.stockValuations));

stockValuationRoutes.get('/', requirePermission('inventory', 'READ'), StockValuationController.list);
stockValuationRoutes.post('/', requirePermission('inventory', 'CREATE'), StockValuationController.create);

export { stockValuationRoutes };
