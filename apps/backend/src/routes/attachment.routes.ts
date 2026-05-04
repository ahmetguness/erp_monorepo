import { Hono } from 'hono';
import { AttachmentController } from '../controllers/attachment.controller';

// Attachments tüm planlara açık — requireAuth zaten tenantApi seviyesinde uygulanıyor
const attachmentRoutes = new Hono();

attachmentRoutes.get('/', AttachmentController.listByEntity);
attachmentRoutes.post('/upload', AttachmentController.upload);
attachmentRoutes.get('/:id/download', AttachmentController.download);
attachmentRoutes.patch('/:id', AttachmentController.rename);
attachmentRoutes.delete('/:id', AttachmentController.delete);

export { attachmentRoutes };
