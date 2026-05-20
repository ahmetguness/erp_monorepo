import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { PaginatedResponseSchema, SingleResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

export const AuditEntityTypeSchema = z.enum([
  'INVOICE',
  'PRODUCT',
  'CATEGORY',
  'CONTACT',
  'EMPLOYEE',
  'CUSTOMER_ASSET',
  'SERVICE_REQUEST',
  'PURCHASE_ORDER',
  'SALES_QUOTE',
  'SALES_ORDER',
  'WORK_ORDER',
  'DELIVERY_NOTE',
  'OTHER',
]);

export type AuditEntityType = z.infer<typeof AuditEntityTypeSchema>;

export const AuditLogSchema = z.object({
  id: z.string(), tenantId: z.string(), userId: z.string().nullable(),
  module: z.string(), entityType: AuditEntityTypeSchema, entityId: z.string(),
  entityLabel: z.string().nullable().optional(),
  userLabel: z.string().nullable().optional(),
  business: z.object({
    actionLabel: z.string(),
    moduleLabel: z.string(),
    entityTypeLabel: z.string(),
    summary: z.string(),
    changes: z.array(z.object({
      field: z.string(),
      label: z.string(),
      oldValue: z.string().nullable(),
      newValue: z.string().nullable(),
    })),
  }).optional(),
  action: z.string(), oldValues: z.unknown().nullable(), newValues: z.unknown().nullable(),
  ipAddress: z.string().nullable(), userAgent: z.string().nullable(),
  createdAt: z.string(),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

export const AuditLogExportSchema = z.object({
  data: z.array(AuditLogSchema),
  meta: z.object({
    total: z.number(),
    exportedAt: z.string(),
    format: z.literal('json'),
  }),
});

export type AuditLogExport = z.infer<typeof AuditLogExportSchema>;

export interface AuditLogParams extends PaginationParams {
  module?: string;
  entityType?: AuditEntityType;
  entityId?: string;
  action?: string;
  userId?: string;
}

export async function getAuditLogs(params: AuditLogParams) {
  const res = await apiClient.get('/api/audit-logs', { params });
  return safeParse(PaginatedResponseSchema(AuditLogSchema), res.data, 'getAuditLogs');
}

export async function getAuditLogById(id: string): Promise<AuditLog> {
  const res = await apiClient.get(`/api/audit-logs/${id}`);
  return safeParse(SingleResponseSchema(AuditLogSchema), res.data, 'getAuditLogById').data;
}

export async function exportAuditLogs(params?: Pick<AuditLogParams, 'module'> & { dateFrom?: string; dateTo?: string }): Promise<AuditLogExport> {
  const res = await apiClient.get('/api/audit-logs/export', { params });
  return safeParse(AuditLogExportSchema, res.data, 'exportAuditLogs');
}
