import { Hono } from 'hono';
import { WarehouseController, LocationController } from '../controllers/warehouse.controller';
import { enforceStarterLimits } from '../middleware/enforceStarterLimits';
import { requireModule } from '../middleware/requireModule';
import { MODULE_KEYS } from '../types/module.types';

const warehouseRoutes = new Hono();

warehouseRoutes.use('*', requireModule(MODULE_KEYS.INVENTORY));

// Statik route'lar önce — dynamic /:id ile çakışmayı önler
warehouseRoutes.post('/transfer', enforceStarterLimits('warehouse_transfer'), WarehouseController.transfer);

warehouseRoutes.get('/', WarehouseController.list);
warehouseRoutes.post('/', enforceStarterLimits('warehouse'), WarehouseController.create);
warehouseRoutes.get('/:id', WarehouseController.getById);
warehouseRoutes.patch('/:id', WarehouseController.update);

// Lokasyonlar — /api/locations prefix'i altında, warehouseId query param ile
// NOT: /:id/locations yerine ayrı route kullanıyoruz çünkü Hono'da
// /:id ve /:warehouseId aynı segment olduğundan çakışma olmaz,
// ama okunabilirlik için açık tutalım
warehouseRoutes.get('/:warehouseId/locations', LocationController.list);
warehouseRoutes.post('/:warehouseId/locations', LocationController.create);
warehouseRoutes.delete('/:warehouseId/locations/:locationId', LocationController.remove);

export { warehouseRoutes };
