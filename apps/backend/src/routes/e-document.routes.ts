import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requirePermission } from '../middleware/requirePermission';
import { EDocumentController } from '../controllers/e-document.controller';

const eDocumentRoutes = new Hono();

eDocumentRoutes.use('*', requirePlan(Plan.PROFESSIONAL));

eDocumentRoutes.get('/', requirePermission('invoicing', 'READ'), EDocumentController.list);
eDocumentRoutes.get('/:id', requirePermission('invoicing', 'READ'), EDocumentController.getById);
eDocumentRoutes.post('/', requirePermission('invoicing', 'CREATE'), EDocumentController.create);
eDocumentRoutes.patch('/:id/status', requirePermission('invoicing', 'UPDATE'), EDocumentController.updateStatus);

export { eDocumentRoutes };
