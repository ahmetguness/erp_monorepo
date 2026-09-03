import { z } from 'zod';

export const CollaborationActorSchema = z.object({ id: z.string(), name: z.string(), email: z.string() });
export const CollaborationEntryTypeSchema = z.enum(['COMMENT', 'DECISION', 'EMAIL_LINK']);
export const CollaborationEntrySchema = z.object({
  id: z.string(), type: CollaborationEntryTypeSchema, content: z.string(), mentionIds: z.array(z.string()),
  externalId: z.string().nullable(), actor: CollaborationActorSchema, createdAt: z.string(), updatedAt: z.string(),
});
export const RecordCollaborationSnapshotSchema = z.object({
  entries: z.array(CollaborationEntrySchema), followers: z.array(CollaborationActorSchema),
  isFollowing: z.boolean(), mentionCandidates: z.array(CollaborationActorSchema),
});
export type CollaborationEntryType = z.infer<typeof CollaborationEntryTypeSchema>;
export type RecordCollaborationSnapshot = z.infer<typeof RecordCollaborationSnapshotSchema>;
