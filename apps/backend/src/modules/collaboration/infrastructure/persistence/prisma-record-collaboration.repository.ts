import type { PrismaClient } from '@prisma/client';
import type { RecordCollaborationRepository } from '../../application/record-collaboration.ports.js';
import type { CollaborationActor, CollaborationEntry, CreateCollaborationEntryInput, RecordEntityType } from '../../application/record-collaboration.types.js';

const actorSelect = { id: true, name: true, email: true } as const;

function toEntry(row: {
  id: string; type: CollaborationEntry['type']; content: string; mentionIds: string[]; externalId: string | null;
  createdAt: Date; updatedAt: Date; createdBy: CollaborationActor;
}): CollaborationEntry {
  return { id: row.id, type: row.type, content: row.content, mentionIds: row.mentionIds, externalId: row.externalId, actor: row.createdBy, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export class PrismaRecordCollaborationRepository implements RecordCollaborationRepository {
  constructor(private readonly db: PrismaClient) {}

  async recordExists(tenantId: string, entityType: RecordEntityType, entityId: string): Promise<boolean> {
    const where = { tenantId, id: entityId, deletedAt: null };
    switch (entityType) {
      case 'INVOICE': return (await this.db.invoice.count({ where })) > 0;
      case 'PRODUCT': return (await this.db.product.count({ where })) > 0;
      case 'CONTACT': return (await this.db.contact.count({ where })) > 0;
      case 'EMPLOYEE': return (await this.db.employee.count({ where })) > 0;
      case 'CUSTOMER_ASSET': return (await this.db.customerAsset.count({ where })) > 0;
      case 'SERVICE_REQUEST': return (await this.db.serviceRequest.count({ where })) > 0;
      case 'PURCHASE_ORDER': return (await this.db.purchaseOrder.count({ where })) > 0;
      case 'SALES_QUOTE': return (await this.db.salesQuote.count({ where })) > 0;
      case 'SALES_ORDER': return (await this.db.salesOrder.count({ where })) > 0;
      case 'WORK_ORDER': return (await this.db.workOrder.count({ where })) > 0;
      case 'DELIVERY_NOTE': return (await this.db.deliveryNote.count({ where })) > 0;
      case 'CATEGORY': return (await this.db.category.count({ where: { tenantId, id: entityId } })) > 0;
      case 'OTHER': return false;
    }
  }

  async getSnapshot(tenantId: string, userId: string, entityType: RecordEntityType, entityId: string) {
    const [entries, followers, currentFollower, tenantUsers] = await Promise.all([
      this.db.recordCollaborationEntry.findMany({ where: { tenantId, entityType, entityId }, include: { createdBy: { select: actorSelect } }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.db.recordFollower.findMany({ where: { tenantId, entityType, entityId }, select: { user: { select: actorSelect } }, orderBy: { createdAt: 'asc' } }),
      this.db.recordFollower.findUnique({ where: { tenantId_entityType_entityId_userId: { tenantId, entityType, entityId, userId } }, select: { id: true } }),
      this.db.tenantUser.findMany({ where: { tenantId, isActive: true, user: { isActive: true, deletedAt: null } }, select: { user: { select: actorSelect } }, orderBy: { user: { name: 'asc' } } }),
    ]);
    return { entries: entries.map(toEntry), followers: followers.map((row) => row.user), isFollowing: currentFollower !== null, mentionCandidates: tenantUsers.map((row) => row.user) };
  }

  async createEntry(input: CreateCollaborationEntryInput) {
    const row = await this.db.recordCollaborationEntry.create({ data: { tenantId: input.tenantId, entityType: input.entityType, entityId: input.entityId, type: input.type, content: input.content, mentionIds: input.mentionIds, externalId: input.externalId, createdById: input.userId }, include: { createdBy: { select: actorSelect } } });
    return toEntry(row);
  }

  async setFollowing(tenantId: string, userId: string, entityType: RecordEntityType, entityId: string, following: boolean) {
    const key = { tenantId_entityType_entityId_userId: { tenantId, entityType, entityId, userId } };
    if (following) await this.db.recordFollower.upsert({ where: key, create: { tenantId, userId, entityType, entityId }, update: {} });
    else await this.db.recordFollower.deleteMany({ where: { tenantId, userId, entityType, entityId } });
    return following;
  }

  async findActiveTenantUsers(tenantId: string, userIds: string[]) {
    if (userIds.length === 0) return [];
    const rows = await this.db.tenantUser.findMany({ where: { tenantId, userId: { in: userIds }, isActive: true, user: { isActive: true, deletedAt: null } }, select: { user: { select: actorSelect } } });
    return rows.map((row) => row.user);
  }

  async getFollowerUserIds(tenantId: string, entityType: RecordEntityType, entityId: string) {
    const rows = await this.db.recordFollower.findMany({ where: { tenantId, entityType, entityId }, select: { userId: true } });
    return rows.map((row) => row.userId);
  }

  async notifyUsers(tenantId: string, userIds: string[], title: string, message: string, entityType: RecordEntityType, entityId: string) {
    await this.db.notification.createMany({ data: userIds.map((userId) => ({ tenantId, userId, title, message, module: 'collaboration', entityType, entityId })) });
  }
}
