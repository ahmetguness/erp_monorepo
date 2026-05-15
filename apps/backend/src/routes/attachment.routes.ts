import { Hono } from 'hono';
import { AttachmentController } from '../controllers/attachment.controller';
import { requirePermission } from '../middleware/requirePermission';

// Attachments tüm planlara açık — requireAuth zaten tenantApi seviyesinde uygulanıyor
const attachmentRoutes = new Hono();

attachmentRoutes.get('/', requirePermission('attachments', 'READ'), AttachmentController.listByEntity);
attachmentRoutes.post('/upload', requirePermission('attachments', 'CREATE'), AttachmentController.upload);
attachmentRoutes.get('/:id/download', requirePermission('attachments', 'READ'), AttachmentController.download);
attachmentRoutes.patch('/:id', requirePermission('attachments', 'UPDATE'), AttachmentController.rename);
attachmentRoutes.delete('/:id', requirePermission('attachments', 'DELETE'), AttachmentController.delete);

export { attachmentRoutes };
