import { NotFoundError, ValidationError } from '../../../errors/index.js';
import type { RecordCollaborationRepository } from './record-collaboration.ports.js';
import type { CreateCollaborationEntryInput, RecordCollaborationSnapshot } from './record-collaboration.types.js';

const MAX_CONTENT_LENGTH = 4_000;
const MAX_MENTIONS = 20;

export class RecordCollaborationService {
  constructor(private readonly repository: RecordCollaborationRepository) {}

  async getSnapshot(input: Pick<CreateCollaborationEntryInput, 'tenantId' | 'userId' | 'entityType' | 'entityId'>): Promise<RecordCollaborationSnapshot> {
    await this.assertRecordExists(input.tenantId, input.entityType, input.entityId);
    return this.repository.getSnapshot(input.tenantId, input.userId, input.entityType, input.entityId);
  }

  async createEntry(input: CreateCollaborationEntryInput) {
    await this.assertRecordExists(input.tenantId, input.entityType, input.entityId);
    const content = input.content.trim();
    if (!content || content.length > MAX_CONTENT_LENGTH) {
      throw new ValidationError(`İçerik 1-${MAX_CONTENT_LENGTH} karakter arasında olmalıdır.`);
    }
    const mentionIds = Array.from(new Set(input.mentionIds.filter((id) => id !== input.userId))).slice(0, MAX_MENTIONS);
    const validMentionUsers = await this.repository.findActiveTenantUsers(input.tenantId, mentionIds);
    if (validMentionUsers.length !== mentionIds.length) {
      throw new ValidationError('Mention edilen kullanıcılardan biri tenant içinde aktif değil.');
    }
    const entry = await this.repository.createEntry({ ...input, content, mentionIds });
    const followerIds = await this.repository.getFollowerUserIds(input.tenantId, input.entityType, input.entityId);
    const notificationUserIds = Array.from(new Set([...mentionIds, ...followerIds])).filter((id) => id !== input.userId);
    if (notificationUserIds.length > 0) {
      await this.repository.notifyUsers(
        input.tenantId,
        notificationUserIds,
        `${entry.actor.name} kayıt bağlamını güncelledi`,
        content.slice(0, 300),
        input.entityType,
        input.entityId,
      );
    }
    return entry;
  }

  async setFollowing(input: Pick<CreateCollaborationEntryInput, 'tenantId' | 'userId' | 'entityType' | 'entityId'> & { following: boolean }): Promise<boolean> {
    await this.assertRecordExists(input.tenantId, input.entityType, input.entityId);
    return this.repository.setFollowing(input.tenantId, input.userId, input.entityType, input.entityId, input.following);
  }

  private async assertRecordExists(tenantId: string, entityType: CreateCollaborationEntryInput['entityType'], entityId: string): Promise<void> {
    if (!(await this.repository.recordExists(tenantId, entityType, entityId))) throw new NotFoundError('Kayıt', entityId);
  }
}
