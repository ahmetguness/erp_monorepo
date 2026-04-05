import { Hono } from 'hono';
import { requirePlan } from '../middleware/requirePlan';
import { EDocumentController } from '../controllers/e-document.controller';

const eDocumentRoutes = new Hono();

eDocumentRoutes.use('*', requirePlan('PROFESSIONAL'));

eDocumentRoutes.get('/', EDocumentController.list);
eDocumentRoutes.get('/:id', EDocumentController.getById);
eDocumentRoutes.post('/', EDocumentController.create);
eDocumentRoutes.patch('/:id/status', EDocumentController.updateStatus);

export { eDocumentRoutes };
