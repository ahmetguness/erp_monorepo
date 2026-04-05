import { Hono } from 'hono';
import { requirePlan } from '../middleware/requirePlan';
import { LotSerialController } from '../controllers/lot-serial.controller';

const lotSerialRoutes = new Hono();

lotSerialRoutes.use('*', requirePlan('PROFESSIONAL'));

lotSerialRoutes.get('/', LotSerialController.list);
lotSerialRoutes.post('/', LotSerialController.create);
lotSerialRoutes.post('/:id/assign', LotSerialController.assignToMovement);

export { lotSerialRoutes };
