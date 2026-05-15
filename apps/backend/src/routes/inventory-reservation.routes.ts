import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requirePermission } from '../middleware/requirePermission';
import { InventoryReservationController } from '../controllers/inventory-reservation.controller';

const inventoryReservationRoutes = new Hono();

inventoryReservationRoutes.use('*', requirePlan(Plan.PROFESSIONAL));

inventoryReservationRoutes.get('/', requirePermission('inventory', 'READ'), InventoryReservationController.list);
inventoryReservationRoutes.post('/', requirePermission('inventory', 'CREATE'), InventoryReservationController.create);
inventoryReservationRoutes.post('/:id/release', requirePermission('inventory', 'UPDATE'), InventoryReservationController.release);

export { inventoryReservationRoutes };
