import { ACCESS_POLICIES } from '@repo/types/plans';
import { Hono } from 'hono';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { EDocumentController } from '../modules/sales/http/controllers/index.js';

const eDocumentRoutes = new Hono();

eDocumentRoutes.use('*', requireAccess(ACCESS_POLICIES.eDocuments));

eDocumentRoutes.get('/summary', requirePermission('invoicing', 'READ'), EDocumentController.summary);
eDocumentRoutes.get('/exceptions', requirePermission('invoicing', 'READ'), EDocumentController.getExceptions);
eDocumentRoutes.post('/exceptions/:id/retry', requirePermission('invoicing', 'UPDATE'), EDocumentController.retry);
eDocumentRoutes.post('/webhook/callback', EDocumentController.processCallback);
eDocumentRoutes.get('/', requirePermission('invoicing', 'READ'), EDocumentController.list);
eDocumentRoutes.get('/:id', requirePermission('invoicing', 'READ'), EDocumentController.getById);
eDocumentRoutes.post('/', requirePermission('invoicing', 'CREATE'), EDocumentController.create);
eDocumentRoutes.patch('/:id/status', requirePermission('invoicing', 'UPDATE'), EDocumentController.updateStatus);

export { eDocumentRoutes };
