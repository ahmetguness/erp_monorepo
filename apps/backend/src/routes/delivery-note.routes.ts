import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requirePermission } from '../middleware/requirePermission';
import { DeliveryNoteController } from '../controllers/delivery-note.controller';

const deliveryNoteRoutes = new Hono();

deliveryNoteRoutes.use('*', requirePlan(Plan.PROFESSIONAL));

deliveryNoteRoutes.get('/', requirePermission('invoicing', 'READ'), DeliveryNoteController.list);
deliveryNoteRoutes.get('/:id', requirePermission('invoicing', 'READ'), DeliveryNoteController.getById);
deliveryNoteRoutes.post('/', requirePermission('invoicing', 'CREATE'), DeliveryNoteController.create);
deliveryNoteRoutes.patch('/:id/status', requirePermission('invoicing', 'UPDATE'), DeliveryNoteController.updateStatus);

export { deliveryNoteRoutes };
