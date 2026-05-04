import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { InventoryReservationController } from '../controllers/inventory-reservation.controller';

const inventoryReservationRoutes = new Hono();

inventoryReservationRoutes.use('*', requirePlan(Plan.PROFESSIONAL));

inventoryReservationRoutes.get('/', InventoryReservationController.list);
inventoryReservationRoutes.post('/', InventoryReservationController.create);
inventoryReservationRoutes.post('/:id/release', InventoryReservationController.release);

export { inventoryReservationRoutes };
