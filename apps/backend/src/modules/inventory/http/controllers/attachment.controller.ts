import { metadataAttachmentController } from './attachment.controller/metadata.js';
import { queryAttachmentController } from './attachment.controller/query.js';
import { uploadAttachmentController } from './attachment.controller/upload.js';

export const AttachmentController = {
  ...queryAttachmentController,
  ...uploadAttachmentController,
  ...metadataAttachmentController,
} as const;
