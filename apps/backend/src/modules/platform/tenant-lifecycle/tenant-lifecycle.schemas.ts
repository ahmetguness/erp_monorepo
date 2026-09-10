import { z } from 'zod';
import { TENANT_LIFECYCLE_STATUSES } from '@repo/types';

export const lifecycleInputSchema = z.object({
  action: z.enum(['TRANSITION', 'LEGAL_HOLD']),
  targetStatus: z.enum(TENANT_LIFECYCLE_STATUSES).optional(),
  legalHold: z.boolean().optional(),
  retentionUntil: z.string().datetime().optional(),
  deletionNotBefore: z.string().datetime().optional(),
  exportId: z.string().min(1).max(100).optional(),
  checklist: z.object({ ownerNotified: z.boolean(), balancesReviewed: z.boolean(), externalBackupVerified: z.boolean(), retentionReviewed: z.boolean() }).strict().optional(),
  reason: z.string().trim().min(10).max(2000),
  impact: z.string().trim().min(10).max(2000),
  ticketId: z.string().trim().min(1).max(120),
}).strict().refine(input => input.action === 'TRANSITION' ? Boolean(input.targetStatus) && input.legalHold === undefined : typeof input.legalHold === 'boolean' && !input.targetStatus);

export const lifecycleDecisionSchema = z.object({ decision: z.enum(['approve', 'reject']) }).strict();
