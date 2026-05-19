export interface MailAttachmentInput {
  filename: string;
  content: string;
  contentType?: string;
}

export interface NormalizedMailAttachment {
  filename: string;
  content: string;
  contentType: string;
  sizeBytes: number;
}

const CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  pdf: 'application/pdf',
  png: 'image/png',
  txt: 'text/plain',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
};

export function normalizeAttachmentContent(content: string): string {
  const trimmed = content.trim();
  const dataUrlSeparator = trimmed.indexOf(',');
  const withoutPrefix = trimmed.startsWith('data:') && dataUrlSeparator >= 0
    ? trimmed.slice(dataUrlSeparator + 1)
    : trimmed;
  return withoutPrefix.replace(/\s/g, '');
}

export function estimateBase64Bytes(content: string): number {
  const normalized = normalizeAttachmentContent(content);
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function inferContentType(filename: string, contentType?: string): string {
  const explicit = contentType?.trim();
  if (explicit) return explicit;

  const extension = filename.split('.').pop()?.toLowerCase();
  if (extension && CONTENT_TYPES_BY_EXTENSION[extension]) return CONTENT_TYPES_BY_EXTENSION[extension];

  return 'application/octet-stream';
}

function isBase64(content: string): boolean {
  if (!content || content.length % 4 === 1) return false;
  return /^[A-Za-z0-9+/]*={0,2}$/.test(content);
}

export function normalizeMailAttachments(attachments?: MailAttachmentInput[]): NormalizedMailAttachment[] {
  if (!attachments) return [];

  return attachments.map((attachment) => {
    const filename = attachment.filename.trim();
    const content = normalizeAttachmentContent(attachment.content);

    return {
      filename,
      content,
      contentType: inferContentType(filename, attachment.contentType),
      sizeBytes: estimateBase64Bytes(content),
    };
  });
}

export function validateNormalizedMailAttachments(
  attachments: NormalizedMailAttachment[],
  limits: { maxAttachments: number; maxAttachmentBytes: number; maxTotalAttachmentBytes: number },
): string | null {
  if (attachments.length === 0) return null;
  if (attachments.length > limits.maxAttachments) return `En fazla ${limits.maxAttachments} dosya eklenebilir.`;

  let totalBytes = 0;
  for (const attachment of attachments) {
    if (!attachment.filename || !attachment.content) {
      return 'Her dosya eki icin dosya adi ve icerik zorunludur.';
    }

    if (!isBase64(attachment.content)) {
      return `${attachment.filename} dosyasi base64 formatinda degil.`;
    }

    if (attachment.sizeBytes > limits.maxAttachmentBytes) {
      return `${attachment.filename} dosyasi 5 MB sinirini asiyor.`;
    }

    totalBytes += attachment.sizeBytes;
  }

  if (totalBytes > limits.maxTotalAttachmentBytes) return 'Toplam dosya eki boyutu 10 MB sinirini asiyor.';
  return null;
}
