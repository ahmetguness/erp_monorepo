import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { PaginatedResponseSchema, SingleResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

export const AuditLogSchema = z.object({
  id: z.string(), tenantId: z.string(), userId: z.string().nullable(),
  module: z.string(), entityType: z.string(), entityId: z.string(),
  action: z.string(), oldValues: z.unknown().nullable(), newValues: z.unknown().nullable(),
  ipAddress: z.string().nullable(), userAgent: z.string().nullable(),
  createdAt: z.string(),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

export interface AuditLogParams extends PaginationParams {
  module?: string; entityType?: string; action?: string; userId?: string;
}

export async function getAuditLogs(params: AuditLogParams) {
  const res = await apiClient.get('/api/audit-logs', { params });
  return safeParse(PaginatedResponseSchema(AuditLogSchema), res.data, 'getAuditLogs');
}

export async function getAuditLogById(id: string): Promise<AuditLog> {
  const res = await apiClient.get(`/api/audit-logs/${id}`);
  return safeParse(SingleResponseSchema(AuditLogSchema), res.data, 'getAuditLogById').data;
}
