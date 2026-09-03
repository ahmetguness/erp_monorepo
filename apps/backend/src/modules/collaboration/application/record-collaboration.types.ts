export type RecordEntityType = 'INVOICE' | 'PRODUCT' | 'CATEGORY' | 'CONTACT' | 'EMPLOYEE' | 'CUSTOMER_ASSET' | 'SERVICE_REQUEST' | 'PURCHASE_ORDER' | 'SALES_QUOTE' | 'SALES_ORDER' | 'WORK_ORDER' | 'DELIVERY_NOTE' | 'OTHER';
export type CollaborationEntryType = 'COMMENT' | 'DECISION' | 'EMAIL_LINK';

export interface CollaborationActor {
  id: string;
  name: string;
  email: string;
}

export interface CollaborationEntry {
  id: string;
  type: CollaborationEntryType;
  content: string;
  mentionIds: string[];
  externalId: string | null;
  actor: CollaborationActor;
  createdAt: string;
  updatedAt: string;
}

export interface RecordCollaborationContext {
  entityType: RecordEntityType;
  entityId: string;
}

export interface RecordCollaborationSnapshot {
  entries: CollaborationEntry[];
  followers: CollaborationActor[];
  isFollowing: boolean;
  mentionCandidates: CollaborationActor[];
}

export interface CreateCollaborationEntryInput extends RecordCollaborationContext {
  tenantId: string;
  userId: string;
  type: CollaborationEntryType;
  content: string;
  mentionIds: string[];
  externalId?: string;
}
