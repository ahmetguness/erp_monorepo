import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { ProductBatchController } from '../controllers/product-batch.controller';

const productBatchRoutes = new Hono();

productBatchRoutes.use('*', requirePlan(Plan.PROFESSIONAL));

productBatchRoutes.get('/', ProductBatchController.list);
productBatchRoutes.post('/', ProductBatchController.create);
productBatchRoutes.patch('/:id', ProductBatchController.update);

export { productBatchRoutes };
