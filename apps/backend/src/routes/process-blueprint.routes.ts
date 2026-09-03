import { Hono } from 'hono'; import { requirePermission } from '../middleware/requirePermission'; import { ProcessBlueprintController } from '../modules/platform/http/controllers/index.js';
export const processBlueprintRoutes = new Hono();
processBlueprintRoutes.get('/', requirePermission('settings', 'READ'), ProcessBlueprintController.list);
processBlueprintRoutes.get('/sectors', requirePermission('settings', 'READ'), ProcessBlueprintController.sectors);
processBlueprintRoutes.post('/', requirePermission('settings', 'UPDATE'), ProcessBlueprintController.create);
processBlueprintRoutes.post('/import', requirePermission('settings', 'UPDATE'), ProcessBlueprintController.import);
processBlueprintRoutes.post('/preview', requirePermission('settings', 'READ'), ProcessBlueprintController.preview);
processBlueprintRoutes.post('/apply', requirePermission('settings', 'UPDATE'), ProcessBlueprintController.apply);
processBlueprintRoutes.get('/:key/export', requirePermission('settings', 'READ'), ProcessBlueprintController.export);
