import { Hono } from 'hono';
import { WarehouseController, LocationController } from '../controllers/warehouse.controller';
import { enforceStarterLimits } from '../middleware/enforceStarterLimits';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { MODULE_KEYS } from '../types/module.types';

const warehouseRoutes = new Hono();

warehouseRoutes.use('*', requireModule(MODULE_KEYS.INVENTORY));

// Statik route'lar önce — dynamic /:id ile çakışmayı önler
warehouseRoutes.post('/transfer', requirePermission('inventory', 'UPDATE'), enforceStarterLimits('warehouse_transfer'), WarehouseController.transfer);

warehouseRoutes.get('/', requirePermission('inventory', 'READ'), WarehouseController.list);
warehouseRoutes.post('/', requirePermission('inventory', 'CREATE'), enforceStarterLimits('warehouse'), WarehouseController.create);
warehouseRoutes.get('/:id', requirePermission('inventory', 'READ'), WarehouseController.getById);
warehouseRoutes.patch('/:id', requirePermission('inventory', 'UPDATE'), WarehouseController.update);

// Lokasyonlar — /api/locations prefix'i altında, warehouseId query param ile
// NOT: /:id/locations yerine ayrı route kullanıyoruz çünkü Hono'da
// /:id ve /:warehouseId aynı segment olduğundan çakışma olmaz,
// ama okunabilirlik için açık tutalım
warehouseRoutes.get('/:warehouseId/locations', requirePermission('inventory', 'READ'), LocationController.list);
warehouseRoutes.post('/:warehouseId/locations', requirePermission('inventory', 'CREATE'), LocationController.create);
warehouseRoutes.delete('/:warehouseId/locations/:locationId', requirePermission('inventory', 'DELETE'), LocationController.remove);

export { warehouseRoutes };
