import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { InventoryReservationController } from '../controllers/inventory-reservation.controller';

const inventoryReservationRoutes = new Hono();

inventoryReservationRoutes.use('*', requireAccess(ACCESS_POLICIES.reservations));

inventoryReservationRoutes.get('/', requirePermission('inventory', 'READ'), InventoryReservationController.list);
inventoryReservationRoutes.get('/report', requirePermission('inventory', 'READ'), InventoryReservationController.report);
inventoryReservationRoutes.post('/release-expired', requirePermission('inventory', 'UPDATE'), InventoryReservationController.releaseExpired);
inventoryReservationRoutes.post('/from-sales-order', requirePermission('inventory', 'CREATE'), InventoryReservationController.createFromSalesOrder);
inventoryReservationRoutes.post('/', requirePermission('inventory', 'CREATE'), InventoryReservationController.create);
inventoryReservationRoutes.post('/:id/release', requirePermission('inventory', 'UPDATE'), InventoryReservationController.release);

export { inventoryReservationRoutes };
