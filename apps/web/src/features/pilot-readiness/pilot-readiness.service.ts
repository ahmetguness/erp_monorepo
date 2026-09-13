import type { PilotReadinessReport } from '@repo/types';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';

const checkKeySchema = z.enum(['stock_integrity', 'retry_safety', 'tenant_isolation', 'deterministic_flow']);

export const pilotReadinessReportSchema = z.object({
  decision: z.enum(['GO', 'NO_GO']),
  generatedAt: z.iso.datetime(),
  checks: z.array(z.object({
    key: checkKeySchema,
    label: z.string(),
    status: z.enum(['PASS', 'FAIL']),
    detail: z.string(),
    evidence: z.array(z.string()),
  })),
  blockers: z.array(checkKeySchema),
}) satisfies z.ZodType<PilotReadinessReport>;

export async function getPilotReadiness(): Promise<PilotReadinessReport> {
  const response = await apiClient.get('/api/pilot-readiness');
  return pilotReadinessReportSchema.parse(response.data.data);
}
