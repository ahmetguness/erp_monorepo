import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { EDocumentController } from '../controllers/e-document.controller';

const eDocumentRoutes = new Hono();

eDocumentRoutes.use('*', requireAccess(ACCESS_POLICIES.eDocuments));

eDocumentRoutes.get('/', requirePermission('invoicing', 'READ'), EDocumentController.list);
eDocumentRoutes.get('/:id', requirePermission('invoicing', 'READ'), EDocumentController.getById);
eDocumentRoutes.post('/', requirePermission('invoicing', 'CREATE'), EDocumentController.create);
eDocumentRoutes.patch('/:id/status', requirePermission('invoicing', 'UPDATE'), EDocumentController.updateStatus);

export { eDocumentRoutes };
