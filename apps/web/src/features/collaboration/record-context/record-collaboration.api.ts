import { apiClient } from '@/lib/api-client';
import { z } from 'zod';
import { safeParse } from '@/lib/safe-parse';
import type { AuditEntityType } from '@/services/audit-log.service';
import { RecordCollaborationSnapshotSchema, CollaborationEntrySchema, type CollaborationEntryType } from './record-collaboration.schemas';

export interface RecordContext { entityType: AuditEntityType; entityId: string }
const path = ({ entityType, entityId }: RecordContext) => `/api/record-collaboration/${entityType}/${encodeURIComponent(entityId)}`;

export async function getRecordCollaboration(context: RecordContext) {
  const response = await apiClient.get(path(context));
  return safeParse(RecordCollaborationSnapshotSchema, response.data.data, 'getRecordCollaboration');
}

export async function createCollaborationEntry(context: RecordContext, input: { type: CollaborationEntryType; content: string; mentionIds: string[]; externalId?: string }) {
  const response = await apiClient.post(`${path(context)}/entries`, input);
  return safeParse(CollaborationEntrySchema, response.data.data, 'createCollaborationEntry');
}

export async function setRecordFollowing(context: RecordContext, following: boolean): Promise<boolean> {
  const response = await apiClient.put(`${path(context)}/following`, { following });
  return zFollowing.parse(response.data.data).following;
}

const zFollowing = z.object({ following: z.boolean() });
