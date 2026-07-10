import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const SavedReportSchema = z.object({
  id: z.string(), tenantId: z.string(), name: z.string(), module: z.string(),
  filters: z.unknown(), columns: z.array(z.string()),
  isShared: z.boolean(),
  sharedRoleIds: z.array(z.string()).default([]),
  sharedUserIds: z.array(z.string()).default([]),
  columnTemplateName: z.string().nullable().optional(),
  pinnedToDashboard: z.boolean().default(false),
  createdBy: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
});

export type SavedReport = z.infer<typeof SavedReportSchema>;

export interface CreateSavedReportDTO {
  name: string; module: string;
  filters?: Record<string, unknown>; columns?: string[]; isShared?: boolean;
  sharedRoleIds?: string[]; sharedUserIds?: string[]; columnTemplateName?: string | null; pinnedToDashboard?: boolean;
}

export async function getSavedReports(module?: string): Promise<SavedReport[]> {
  const res = await apiClient.get('/api/reports/saved', { params: module ? { module } : {} });
  return safeParse(SingleResponseSchema(z.array(SavedReportSchema)), res.data, 'getSavedReports').data;
}

export async function getSavedReportById(id: string): Promise<SavedReport> {
  const res = await apiClient.get(`/api/reports/saved/${id}`);
  return safeParse(SingleResponseSchema(SavedReportSchema), res.data, 'getSavedReportById').data;
}

export async function createSavedReport(data: CreateSavedReportDTO): Promise<SavedReport> {
  const res = await apiClient.post('/api/reports/saved', data);
  return safeParse(SingleResponseSchema(SavedReportSchema), res.data, 'createSavedReport').data;
}

export async function updateSavedReport(id: string, data: Partial<CreateSavedReportDTO>): Promise<SavedReport> {
  const res = await apiClient.patch(`/api/reports/saved/${id}`, data);
  return safeParse(SingleResponseSchema(SavedReportSchema), res.data, 'updateSavedReport').data;
}

export async function deleteSavedReport(id: string): Promise<void> {
  await apiClient.delete(`/api/reports/saved/${id}`);
}
