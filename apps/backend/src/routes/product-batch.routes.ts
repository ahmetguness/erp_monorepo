import { ACCESS_POLICIES } from '@repo/types/plans';
import { Hono } from 'hono';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { ProductBatchController } from '../modules/inventory/http/controllers/index.js';

const productBatchRoutes = new Hono();

productBatchRoutes.use('*', requireAccess(ACCESS_POLICIES.productBatches));

productBatchRoutes.get('/', requirePermission('inventory', 'READ'), ProductBatchController.list);
productBatchRoutes.post('/', requirePermission('inventory', 'CREATE'), ProductBatchController.create);
productBatchRoutes.patch('/:id', requirePermission('inventory', 'UPDATE'), ProductBatchController.update);

export { productBatchRoutes };
