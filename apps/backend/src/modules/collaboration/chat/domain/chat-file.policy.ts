import { ValidationError } from '../../../../errors/index.js';

export const CHAT_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
  'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export function normalizeChatFileName(name: string): string {
  const cleaned = name.normalize('NFKC').replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim().slice(0, 180);
  if (!cleaned) throw new ValidationError('Dosya adı geçersiz.');
  return cleaned;
}

export function validateChatMimeType(contentType: string): void {
  if (!CHAT_ALLOWED_MIME_TYPES.has(contentType)) throw new ValidationError('Bu dosya tipi desteklenmiyor.');
}

export function chatFileExtension(name: string): string {
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(index).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 12) : '';
}

export function chatAttachmentKind(contentType: string): 'IMAGE' | 'DOCUMENT' | 'OTHER' {
  if (contentType.startsWith('image/')) return 'IMAGE';
  if (contentType === 'application/pdf' || contentType.includes('document') || contentType.includes('sheet')) return 'DOCUMENT';
  return 'OTHER';
}
