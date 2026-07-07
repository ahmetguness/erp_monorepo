import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { AttachmentController } from '../controllers/attachment.controller';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';

// Document center is Starter-enabled by default, but can be disabled via feature override.
const attachmentRoutes = new Hono();

attachmentRoutes.use('*', requireAccess(ACCESS_POLICIES.documentCenter));

attachmentRoutes.get('/library', requirePermission('attachments', 'READ'), AttachmentController.library);
attachmentRoutes.get('/entity-options', requirePermission('attachments', 'READ'), AttachmentController.entityOptions);
attachmentRoutes.get('/', requirePermission('attachments', 'READ'), AttachmentController.listByEntity);
attachmentRoutes.post('/upload', requirePermission('attachments', 'CREATE'), AttachmentController.upload);
attachmentRoutes.post('/bulk-metadata', requirePermission('attachments', 'UPDATE'), AttachmentController.bulkMetadata);
attachmentRoutes.get('/:id/access-log', requirePermission('attachments', 'READ'), AttachmentController.accessLog);
attachmentRoutes.post('/:id/version', requirePermission('attachments', 'CREATE'), AttachmentController.uploadVersion);
attachmentRoutes.get('/:id/download', requirePermission('attachments', 'READ'), AttachmentController.download);
attachmentRoutes.patch('/:id', requirePermission('attachments', 'UPDATE'), AttachmentController.rename);
attachmentRoutes.delete('/:id', requirePermission('attachments', 'DELETE'), AttachmentController.delete);

export { attachmentRoutes };
