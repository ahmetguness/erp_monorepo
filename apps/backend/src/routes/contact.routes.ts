import { Hono } from 'hono';
import { ContactController, AccountEntryController } from '../controllers/contact.controller';
import { requireModule } from '../middleware/requireModule';
import { MODULE_KEYS } from '../types/module.types';

const contactRoutes = new Hono();

contactRoutes.use('*', requireModule(MODULE_KEYS.CONTACTS));

contactRoutes.get('/', ContactController.list);
contactRoutes.get('/:id', ContactController.getById);
contactRoutes.post('/', ContactController.create);
contactRoutes.patch('/:id', ContactController.update);
contactRoutes.delete('/:id', ContactController.remove);

// Cari hesap hareketleri
contactRoutes.get('/:contactId/entries', AccountEntryController.list);

export { contactRoutes };
