import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const TodayWorkItemSchema = z.object({
  id: z.string(), sourceId: z.string(), kind: z.enum(['TASK', 'APPROVAL', 'ANOMALY', 'DATA_QUALITY', 'AUTOMATION_EXCEPTION']),
  title: z.string(), detail: z.string().nullable(), risk: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  dueAt: z.string().nullable(), occurredAt: z.string(), monetaryImpact: z.number().nullable(),
  assignee: z.object({ id: z.string(), name: z.string() }).nullable(), reason: z.string(), score: z.number(),
  sla: z.object({ state: z.enum(['ON_TRACK', 'DUE_SOON', 'BREACHED', 'NO_DEADLINE']), remainingMinutes: z.number().nullable() }),
  action: z.object({ kind: z.enum(['OPEN', 'COMPLETE']), label: z.string(), href: z.string() }),
});
export const TodayWorkQueueSchema = z.object({
  generatedAt: z.string(), items: z.array(TodayWorkItemSchema),
  summary: z.object({ total: z.number(), critical: z.number(), breached: z.number(), monetaryImpact: z.number() }),
});
export type TodayWorkItem = z.infer<typeof TodayWorkItemSchema>;
export type TodayWorkQueue = z.infer<typeof TodayWorkQueueSchema>;

export async function getTodayWorkQueue(): Promise<TodayWorkQueue> {
  const response = await apiClient.get('/api/tasks/today');
  return safeParse(SingleResponseSchema(TodayWorkQueueSchema), response.data, 'getTodayWorkQueue').data;
}
