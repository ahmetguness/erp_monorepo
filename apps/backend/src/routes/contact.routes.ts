import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { ContactController, AccountEntryController } from '../controllers/contact.controller';
import { requireAccess } from '../middleware/requireAccess';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { MODULE_KEYS } from '../types/module.types';

const contactRoutes = new Hono();

contactRoutes.use('*', requireModule(MODULE_KEYS.CONTACTS));

contactRoutes.get('/tracking-dashboard', requirePermission('contacts', 'READ'), ContactController.trackingDashboard);
contactRoutes.get('/', requirePermission('contacts', 'READ'), ContactController.list);
contactRoutes.get('/:id/performance', requireAccess(ACCESS_POLICIES.supplierPerformance), requirePermission('contacts', 'READ'), ContactController.getPerformanceScore);
contactRoutes.get('/:contactId/entries', requirePermission('contacts', 'READ'), AccountEntryController.list);
contactRoutes.get('/:id', requirePermission('contacts', 'READ'), ContactController.getById);
contactRoutes.post('/', requirePermission('contacts', 'CREATE'), ContactController.create);
contactRoutes.patch('/:id', requirePermission('contacts', 'UPDATE'), ContactController.update);
contactRoutes.delete('/:id', requirePermission('contacts', 'DELETE'), ContactController.remove);

export { contactRoutes };
