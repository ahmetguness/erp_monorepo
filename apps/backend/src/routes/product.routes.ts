import { Hono } from 'hono';
import { ProductController } from '../controllers/product.controller';
import { ProductQuickImportController } from '../controllers/product-quick-import.controller';
import { enforceStarterLimits } from '../middleware/enforceStarterLimits';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validateBody';
import { productQuickImportBodySchema } from '../schemas/request-body.schemas';
import { MODULE_KEYS } from '../types/module.types';

const productRoutes = new Hono();

productRoutes.use('*', requireModule(MODULE_KEYS.INVENTORY));

productRoutes.get('/', requirePermission('inventory', 'READ'), ProductController.list);
productRoutes.get('/quick-import/template', requirePermission('inventory', 'READ'), ProductQuickImportController.template);
productRoutes.post('/quick-import/preview', requirePermission('inventory', 'CREATE'), validateBody(productQuickImportBodySchema), ProductQuickImportController.preview);
productRoutes.post('/quick-import/commit', requirePermission('inventory', 'CREATE'), validateBody(productQuickImportBodySchema), ProductQuickImportController.commit);
productRoutes.get('/:id', requirePermission('inventory', 'READ'), ProductController.getById);
productRoutes.post('/', requirePermission('inventory', 'CREATE'), enforceStarterLimits('product'), ProductController.create);
productRoutes.patch('/:id', requirePermission('inventory', 'UPDATE'), ProductController.update);
productRoutes.delete('/:id', requirePermission('inventory', 'DELETE'), ProductController.remove);

export { productRoutes };
