import { Hono } from 'hono';
import { requirePlan } from '../middleware/requirePlan';
import { InventoryReservationController } from '../controllers/inventory-reservation.controller';

const inventoryReservationRoutes = new Hono();

inventoryReservationRoutes.use('*', requirePlan('PROFESSIONAL'));

inventoryReservationRoutes.get('/', InventoryReservationController.list);
inventoryReservationRoutes.post('/', InventoryReservationController.create);
inventoryReservationRoutes.post('/:id/release', InventoryReservationController.release);

export { inventoryReservationRoutes };
