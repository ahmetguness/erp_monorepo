import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const SavedViewScopeSchema = z.enum(['PERSONAL', 'TENANT', 'ROLE']);
export const SavedViewSortSchema = z.object({
  key: z.string(),
  direction: z.enum(['asc', 'desc']),
});
export const SavedViewStateSchema = z.object({
  filters: z.record(z.string(), z.unknown()).default({}),
  sort: SavedViewSortSchema.nullable().optional(),
  columns: z.array(z.string()).optional(),
  pageSize: z.number().int().positive().optional(),
}).passthrough();

export const SavedViewSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  userId: z.string().nullable(),
  roleId: z.string().nullable(),
  name: z.string(),
  module: z.string(),
  listKey: z.string(),
  scope: SavedViewScopeSchema,
  state: SavedViewStateSchema,
  isDefault: z.boolean(),
  createdById: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SavedViewScope = z.infer<typeof SavedViewScopeSchema>;
export type SavedViewState = z.infer<typeof SavedViewStateSchema>;
export type SavedView = z.infer<typeof SavedViewSchema>;

export function getSavedViewFilterString(state: SavedViewState, key: string): string {
  const value = state.filters[key];
  return typeof value === 'string' ? value : '';
}

export interface CreateSavedViewDTO {
  name: string;
  module: string;
  listKey: string;
  scope: SavedViewScope;
  state: SavedViewState;
  roleId?: string;
  isDefault?: boolean;
}

export type UpdateSavedViewDTO = Partial<Pick<CreateSavedViewDTO, 'name' | 'state' | 'isDefault'>>;

export async function getSavedViews(listKey?: string): Promise<SavedView[]> {
  const res = await apiClient.get('/api/saved-views', { params: listKey ? { listKey } : undefined });
  return safeParse(SingleResponseSchema(z.array(SavedViewSchema)), res.data, 'getSavedViews').data;
}

export async function createSavedView(data: CreateSavedViewDTO): Promise<SavedView> {
  const res = await apiClient.post('/api/saved-views', data);
  return safeParse(SingleResponseSchema(SavedViewSchema), res.data, 'createSavedView').data;
}

export async function updateSavedView(id: string, data: UpdateSavedViewDTO): Promise<SavedView> {
  const res = await apiClient.patch(`/api/saved-views/${id}`, data);
  return safeParse(SingleResponseSchema(SavedViewSchema), res.data, 'updateSavedView').data;
}

export async function deleteSavedView(id: string): Promise<void> {
  await apiClient.delete(`/api/saved-views/${id}`);
}
