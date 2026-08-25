import { queryAttachmentController } from './attachment.controller/query.js';
import { uploadAttachmentController } from './attachment.controller/upload.js';
import { metadataAttachmentController } from './attachment.controller/metadata.js';

export const AttachmentController = {
  ...queryAttachmentController,
  ...uploadAttachmentController,
  ...metadataAttachmentController,
} as const;
