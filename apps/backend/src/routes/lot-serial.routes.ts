import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { LotSerialController } from '../controllers/lot-serial.controller';

const lotSerialRoutes = new Hono();

lotSerialRoutes.use('*', requirePlan(Plan.PROFESSIONAL));

lotSerialRoutes.get('/', LotSerialController.list);
lotSerialRoutes.post('/', LotSerialController.create);
lotSerialRoutes.post('/:id/assign', LotSerialController.assignToMovement);

export { lotSerialRoutes };
