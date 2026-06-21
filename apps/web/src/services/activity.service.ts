import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { AuditEntityTypeSchema } from '@/services/audit-log.service';

// ─────────────────────────────────────────────
// Activity Service — Zod Şemaları & API Çağrısı
// ─────────────────────────────────────────────

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

/**
 * İş önemi seviyesi.
 * - high: finansal, onay/red, silme, durum değişimi gibi kritik olaylar
 * - medium: güncelleme, görev, mail gibi orta önem
 * - low: dosya eki, bildirim, görev oluşturma gibi düşük önem
 */
export const ActivityImportanceSchema = z.enum(['low', 'medium', 'high']);

export const ActivityItemSchema = z.object({
  id: z.string(),
  source: ActivitySourceSchema,
  sourceType: ActivitySourceSchema,
  sourceId: z.string(),
  tone: ActivityToneSchema,
  title: z.string(),
  businessSummary: z.string(),
  description: z.string().nullable(),
  /**
   * Teknik detay — yalnızca audit kayıtlarında değişen alanların listesi.
   * Diğer kaynaklarda null gelir.
   */
  technicalDetails: z.string().nullable(),
  actorLabel: z.string().nullable(),
  actorId: z.string().nullable(),
  module: z.string().nullable(),
  entityType: AuditEntityTypeSchema,
  entityId: z.string(),
  occurredAt: z.string(),
  href: z.string().nullable(),
  importance: ActivityImportanceSchema,
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
export type ActivityImportance = z.infer<typeof ActivityImportanceSchema>;
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
