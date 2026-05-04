import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { DeliveryNoteController } from '../controllers/delivery-note.controller';

const deliveryNoteRoutes = new Hono();

deliveryNoteRoutes.use('*', requirePlan(Plan.PROFESSIONAL));

deliveryNoteRoutes.get('/', DeliveryNoteController.list);
deliveryNoteRoutes.get('/:id', DeliveryNoteController.getById);
deliveryNoteRoutes.post('/', DeliveryNoteController.create);
deliveryNoteRoutes.patch('/:id/status', DeliveryNoteController.updateStatus);

export { deliveryNoteRoutes };
