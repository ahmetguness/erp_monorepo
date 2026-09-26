import type { ChatMemberRole } from '@prisma/client';
import { ForbiddenError, ValidationError } from '../../../../errors/index.js';

export const CHAT_LIMITS = Object.freeze({
  messageLength: 10_000,
  groupMembers: 250,
  mentions: 50,
  attachments: 10,
  pinnedMessages: 50,
  editWindowMs: 15 * 60 * 1_000,
});

export function assertMessageContent(content: string | null, attachmentCount: number): void {
  if (!content && attachmentCount === 0) throw new ValidationError('Mesaj metni veya eki zorunludur.');
  if (content && content.length > CHAT_LIMITS.messageLength) throw new ValidationError('Mesaj çok uzun.');
  if (attachmentCount > CHAT_LIMITS.attachments) throw new ValidationError('Bir mesajda en fazla 10 dosya olabilir.');
}

export function assertGroupManager(role: ChatMemberRole): void {
  if (role !== 'OWNER' && role !== 'ADMIN') throw new ForbiddenError('Bu grup işlemi için yönetici yetkisi gereklidir.');
}

export function assertMessageMutation(input: { senderId: string; actorId: string; createdAt: Date; deletedAt: Date | null }): void {
  if (input.senderId !== input.actorId) throw new ForbiddenError('Yalnız kendi mesajınızı değiştirebilirsiniz.');
  if (input.deletedAt) throw new ValidationError('Silinmiş mesaj değiştirilemez.');
  if (Date.now() - input.createdAt.getTime() > CHAT_LIMITS.editWindowMs) {
    throw new ForbiddenError('Mesaj düzenleme/silme süresi doldu.');
  }
}
