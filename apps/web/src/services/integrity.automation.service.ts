import { z } from 'zod';
import { apiClient } from '@/lib/api-client';

export const IntegrityAnomalyItemSchema = z.object({
  id: z.string(),
  ruleCode: z.string(),
  title: z.string(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  entityType: z.string(),
  entityId: z.string(),
  description: z.string(),
  actionTaken: z.enum(['AUTO_FIXED', 'SENT_TO_EXCEPTION_CENTER', 'SKIPPED']),
  fixedAt: z.string().optional(),
});

export const IntegrityScanResultSchema = z.object({
  scanTimestamp: z.string(),
  totalRulesChecked: z.number(),
  totalAnomaliesFound: z.number(),
  autoFixedCount: z.number(),
  exceptionCenterCount: z.number(),
  anomalies: z.array(IntegrityAnomalyItemSchema),
});

export type IntegrityAnomalyItem = z.infer<typeof IntegrityAnomalyItemSchema>;
export type IntegrityScanResult = z.infer<typeof IntegrityScanResultSchema>;

export async function runIntegrityScan(autoFix = true): Promise<IntegrityScanResult> {
  const res = await apiClient.post('/api/integrity/scan', { autoFix });
  return res.data.data;
}

export async function resolveExceptionItem(id: string, notes?: string): Promise<{ success: boolean; message: string }> {
  const res = await apiClient.post(`/api/integrity/exceptions/${encodeURIComponent(id)}/resolve`, { notes });
  return res.data.data;
}
