import type { Attachment } from '@/services/attachment.service';

export const ENTITY_IMAGE_TAG = 'entity-image';

export function isImageAttachment(attachment: Attachment): boolean {
  return attachment.mimeType?.startsWith('image/') ?? false;
}

function attachmentTime(attachment: Attachment): number {
  const time = new Date(attachment.createdAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function findEntityImageAttachment(attachments: readonly Attachment[]): Attachment | null {
  const images = attachments.filter(isImageAttachment);
  const tagged = images
    .filter((attachment) => attachment.tags?.includes(ENTITY_IMAGE_TAG))
    .sort((a, b) => attachmentTime(b) - attachmentTime(a));

  if (tagged[0]) return tagged[0];

  const legacy = images.sort((a, b) => attachmentTime(a) - attachmentTime(b));
  return legacy[0] ?? null;
}
