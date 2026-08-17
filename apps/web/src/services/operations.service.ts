import { z } from 'zod';
import { apiClient } from '@/lib/api-client';

export const OperationsHealthSnapshotSchema = z.object({
  generatedAt: z.string(),
  automationHealth: z.object({
    totalExecutions: z.number(),
    succeededCount: z.number(),
    failedCount: z.number(),
    successRatePct: z.number(),
  }),
  domainEvents: z.object({
    totalEvents: z.number(),
    failedCount: z.number(),
    deadLetterCount: z.number(),
    recentFailures: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        lastError: z.string().nullable(),
        updatedAt: z.string(),
      }),
    ),
  }),
  failedJobs: z.object({
    totalFailed: z.number(),
    recentJobs: z.array(
      z.object({
        id: z.string(),
        jobType: z.string(),
        errorMessage: z.string().nullable(),
        updatedAt: z.string(),
      }),
    ),
  }),
  deadLetters: z.object({
    count: z.number(),
  }),
  apiFailures: z.object({
    recentErrorCount: z.number(),
  }),
  marketplaceSyncErrors: z.object({
    failedCount: z.number(),
    recentErrors: z.array(
      z.object({
        id: z.string(),
        integrationId: z.string(),
        errorMessage: z.string().nullable(),
        updatedAt: z.string(),
      }),
    ),
  }),
  eDocumentErrors: z.object({
    errorCount: z.number(),
    recentErrors: z.array(
      z.object({
        id: z.string(),
        invoiceId: z.string(),
        documentType: z.string(),
        errorMessage: z.string().nullable(),
        updatedAt: z.string(),
      }),
    ),
  }),
  accountingPostingErrors: z.object({
    unpostedInvoiceCount: z.number(),
    recentUnposted: z.array(
      z.object({
        id: z.string(),
        number: z.string(),
        totalGross: z.number(),
        createdAt: z.string(),
      }),
    ),
  }),
});

export type OperationsHealthSnapshot = z.infer<typeof OperationsHealthSnapshotSchema>;

export const EntityTimelineEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  title: z.string(),
  description: z.string(),
  actor: z.string(),
  type: z.enum(['INFO', 'SUCCESS', 'WARNING', 'ERROR']),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const EntityTimelineSchema = z.object({
  entityType: z.string(),
  entityId: z.string(),
  entityCode: z.string(),
  status: z.string(),
  createdAt: z.string(),
  events: z.array(EntityTimelineEventSchema),
});

export type EntityTimeline = z.infer<typeof EntityTimelineSchema>;
export type EntityTimelineEvent = z.infer<typeof EntityTimelineEventSchema>;

export async function getOperationsHealth(): Promise<OperationsHealthSnapshot> {
  const res = await apiClient.get('/api/operations/health');
  return res.data.data;
}

export async function getEntityTimeline(entityType: string, entityId: string): Promise<EntityTimeline> {
  const res = await apiClient.get(`/api/operations/timeline/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`);
  return res.data.data;
}
