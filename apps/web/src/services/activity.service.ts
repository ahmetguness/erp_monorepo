import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { AuditEntityTypeSchema } from '@/services/audit-log.service';

export const ActivitySourceSchema = z.enum([
  'AUDIT',
  'ATTACHMENT',
  'MAIL',
  'TASK',
  'NOTIFICATION',
  'APPROVAL',
  'PAYMENT',
  'SERVICE',
]);

export const ActivityToneSchema = z.enum(['neutral', 'success', 'danger', 'warning', 'info']);

export const ActivityItemSchema = z.object({
  id: z.string(),
  source: ActivitySourceSchema,
  tone: ActivityToneSchema,
  title: z.string(),
  description: z.string().nullable(),
  actorLabel: z.string().nullable(),
  module: z.string().nullable(),
  entityType: AuditEntityTypeSchema,
  entityId: z.string(),
  occurredAt: z.string(),
  href: z.string().nullable(),
});

export const ActivityResponseSchema = z.object({
  data: z.array(ActivityItemSchema),
  meta: z.object({
    total: z.number(),
    limit: z.number(),
  }),
});

export type ActivityItem = z.infer<typeof ActivityItemSchema>;
export type ActivitySource = z.infer<typeof ActivitySourceSchema>;
export type ActivityTone = z.infer<typeof ActivityToneSchema>;
export type ActivityResponse = z.infer<typeof ActivityResponseSchema>;

export interface ActivityParams {
  entityType: z.infer<typeof AuditEntityTypeSchema>;
  entityId: string;
  limit?: number;
}

export async function getActivity(params: ActivityParams): Promise<ActivityResponse> {
  const res = await apiClient.get('/api/activity', { params });
  return safeParse(ActivityResponseSchema, res.data, 'getActivity');
}
