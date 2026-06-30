import { Hono } from 'hono';
import { requirePermission } from '../middleware/requirePermission';
import { CollectionReminderController } from '../controllers/collection-reminder.controller';
import { validateBody } from '../middleware/validateBody';
import { createCollectionReminderBodySchema } from '../schemas/request-body.schemas';

const collectionReminderRoutes = new Hono();

collectionReminderRoutes.get('/', requirePermission('accounting', 'READ'), CollectionReminderController.list);
collectionReminderRoutes.post('/', requirePermission('accounting', 'CREATE'), validateBody(createCollectionReminderBodySchema), CollectionReminderController.create);
collectionReminderRoutes.patch('/:id/status', requirePermission('accounting', 'UPDATE'), CollectionReminderController.updateStatus);
collectionReminderRoutes.delete('/:id', requirePermission('accounting', 'DELETE'), CollectionReminderController.remove);

export { collectionReminderRoutes };
