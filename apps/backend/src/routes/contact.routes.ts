import { Hono } from 'hono';
import { ContactController, AccountEntryController } from '../controllers/contact.controller';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { MODULE_KEYS } from '../types/module.types';

const contactRoutes = new Hono();

contactRoutes.use('*', requireModule(MODULE_KEYS.CONTACTS));

contactRoutes.get('/', requirePermission('contacts', 'READ'), ContactController.list);
contactRoutes.get('/:id', requirePermission('contacts', 'READ'), ContactController.getById);
contactRoutes.post('/', requirePermission('contacts', 'CREATE'), ContactController.create);
contactRoutes.patch('/:id', requirePermission('contacts', 'UPDATE'), ContactController.update);
contactRoutes.delete('/:id', requirePermission('contacts', 'DELETE'), ContactController.remove);

contactRoutes.get('/:contactId/entries', requirePermission('contacts', 'READ'), AccountEntryController.list);

export { contactRoutes };
