import { Hono } from 'hono';
import { requirePlan } from '../middleware/requirePlan';
import { ProductBatchController } from '../controllers/product-batch.controller';

const productBatchRoutes = new Hono();

productBatchRoutes.use('*', requirePlan('PROFESSIONAL'));

productBatchRoutes.get('/', ProductBatchController.list);
productBatchRoutes.post('/', ProductBatchController.create);
productBatchRoutes.patch('/:id', ProductBatchController.update);

export { productBatchRoutes };
