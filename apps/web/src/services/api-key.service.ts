import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

export const ApiKeySchema = z.object({
  id: z.string(), tenantId: z.string(), name: z.string(),
  keyPrefix: z.string(), scopes: z.array(z.string()),
  isActive: z.boolean(), lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
  createdById: z.string().nullable(), revokedAt: z.string().nullable(), revokedById: z.string().nullable(),
});

export const ApiKeyWithRawSchema = ApiKeySchema.extend({ rawKey: z.string().optional() });

export type ApiKey = z.infer<typeof ApiKeySchema>;
export type ApiKeyWithRaw = z.infer<typeof ApiKeyWithRawSchema>;

export interface CreateApiKeyDTO { name: string; scopes?: string[]; expiresAt?: string }
export interface ListParams extends PaginationParams { isActive?: string }

export async function getApiKeys(params: ListParams) {
  const res = await apiClient.get('/api/api-keys', { params });
  return safeParse(PaginatedResponseSchema(ApiKeySchema), res.data, 'getApiKeys');
}

export async function createApiKey(data: CreateApiKeyDTO): Promise<ApiKeyWithRaw> {
  const res = await apiClient.post('/api/api-keys', data);
  return safeParse(SingleResponseSchema(ApiKeyWithRawSchema), res.data, 'createApiKey').data;
}

export async function revokeApiKey(id: string): Promise<ApiKey> {
  const res = await apiClient.post(`/api/api-keys/${id}/revoke`);
  return safeParse(SingleResponseSchema(ApiKeySchema), res.data, 'revokeApiKey').data;
}

export async function deleteApiKey(id: string) {
  await apiClient.delete(`/api/api-keys/${id}`);
}
