import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requirePermission } from '../middleware/requirePermission';
import { ProductBatchController } from '../controllers/product-batch.controller';

const productBatchRoutes = new Hono();

productBatchRoutes.use('*', requirePlan(Plan.PROFESSIONAL));

productBatchRoutes.get('/', requirePermission('inventory', 'READ'), ProductBatchController.list);
productBatchRoutes.post('/', requirePermission('inventory', 'CREATE'), ProductBatchController.create);
productBatchRoutes.patch('/:id', requirePermission('inventory', 'UPDATE'), ProductBatchController.update);

export { productBatchRoutes };
