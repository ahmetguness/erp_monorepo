import { Hono } from 'hono';
import { AttachmentController } from '../controllers/attachment.controller';

const attachmentRoutes = new Hono();

attachmentRoutes.get('/', AttachmentController.listByEntity);
attachmentRoutes.post('/upload', AttachmentController.upload);
attachmentRoutes.get('/:id/download', AttachmentController.download);
attachmentRoutes.patch('/:id', AttachmentController.rename);
attachmentRoutes.delete('/:id', AttachmentController.delete);

export { attachmentRoutes };
