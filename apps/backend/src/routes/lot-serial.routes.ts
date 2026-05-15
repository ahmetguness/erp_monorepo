import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requirePermission } from '../middleware/requirePermission';
import { LotSerialController } from '../controllers/lot-serial.controller';

const lotSerialRoutes = new Hono();

lotSerialRoutes.use('*', requirePlan(Plan.PROFESSIONAL));

lotSerialRoutes.get('/', requirePermission('inventory', 'READ'), LotSerialController.list);
lotSerialRoutes.post('/', requirePermission('inventory', 'CREATE'), LotSerialController.create);
lotSerialRoutes.post('/:id/assign', requirePermission('inventory', 'UPDATE'), LotSerialController.assignToMovement);

export { lotSerialRoutes };
