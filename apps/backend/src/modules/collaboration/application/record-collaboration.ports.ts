import type { CollaborationActor, CollaborationEntry, CreateCollaborationEntryInput, RecordCollaborationSnapshot, RecordEntityType } from './record-collaboration.types.js';

export interface RecordCollaborationRepository {
  recordExists(tenantId: string, entityType: RecordEntityType, entityId: string): Promise<boolean>;
  getSnapshot(tenantId: string, userId: string, entityType: RecordEntityType, entityId: string): Promise<RecordCollaborationSnapshot>;
  createEntry(input: CreateCollaborationEntryInput): Promise<CollaborationEntry>;
  setFollowing(tenantId: string, userId: string, entityType: RecordEntityType, entityId: string, following: boolean): Promise<boolean>;
  findActiveTenantUsers(tenantId: string, userIds: string[]): Promise<CollaborationActor[]>;
  getFollowerUserIds(tenantId: string, entityType: RecordEntityType, entityId: string): Promise<string[]>;
  notifyUsers(tenantId: string, userIds: string[], title: string, message: string, entityType: RecordEntityType, entityId: string): Promise<void>;
}
