import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { DeliveryNoteController } from '../controllers/delivery-note.controller';

const deliveryNoteRoutes = new Hono();

deliveryNoteRoutes.use('*', requireAccess(ACCESS_POLICIES.deliveryNotes));

deliveryNoteRoutes.get('/', requirePermission('invoicing', 'READ'), DeliveryNoteController.list);
deliveryNoteRoutes.get('/:id', requirePermission('invoicing', 'READ'), DeliveryNoteController.getById);
deliveryNoteRoutes.post('/', requirePermission('invoicing', 'CREATE'), DeliveryNoteController.create);
deliveryNoteRoutes.patch('/:id/status', requirePermission('invoicing', 'UPDATE'), DeliveryNoteController.updateStatus);

export { deliveryNoteRoutes };
