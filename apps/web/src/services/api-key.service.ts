import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { PaginatedResponseSchema, SingleResponseSchema, type PaginationParams } from '@/types/api.types';

export const API_KEY_SCOPE_VALUES = [
  'products:read',
  'products:write',
  'products:delete',
  'contacts:read',
  'contacts:write',
  'contacts:delete',
  'invoices:read',
  'invoices:write',
  'invoices:delete',
  'inventory:read',
  'inventory:write',
  'orders:read',
  'orders:write',
] as const;

export const ApiKeyScopeSchema = z.enum(API_KEY_SCOPE_VALUES);
export type ApiKeyScope = z.infer<typeof ApiKeyScopeSchema>;

export const ApiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(ApiKeyScopeSchema.or(z.string())),
  isActive: z.boolean(),
  lastUsedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  createdById: z.string().nullable().optional(),
  revokedAt: z.string().nullable().optional(),
  revokedById: z.string().nullable().optional(),
  requestCount: z.coerce.number().optional(),
  errorCount: z.coerce.number().optional(),
  errorRate: z.coerce.number().optional(),
  lastIpAddress: z.string().nullable().optional(),
  lastStatus: z.coerce.number().nullable().optional(),
});

export const ApiKeyWithRawSchema = ApiKeySchema.extend({ rawKey: z.string().optional() });
export const ApiKeyActivitySchema = z.object({
  id: z.string(),
  action: z.string(),
  newValues: z.unknown().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
});

export const ExternalApiEndpointSchema = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'DELETE']),
  path: z.string(),
  summary: z.string(),
  description: z.string(),
  scope: ApiKeyScopeSchema.or(z.string()),
  group: z.string(),
  sandboxSupported: z.boolean(),
  queryExample: z.string().optional(),
  requestExample: z.unknown().optional(),
  responseExample: z.unknown(),
});

export const ExternalScopeManifestItemSchema = z.object({
  scope: ApiKeyScopeSchema.or(z.string()),
  label: z.string(),
  description: z.string(),
  endpoints: z.array(z.object({
    method: z.enum(['GET', 'POST', 'PATCH', 'DELETE']),
    path: z.string(),
    summary: z.string(),
    sandboxSupported: z.boolean(),
  })),
});

export const ExternalApiManifestSchema = z.object({
  version: z.string(),
  basePath: z.string(),
  auth: z.object({
    header: z.literal('x-api-key'),
    sandboxHeader: z.literal('x-sandbox-mode'),
  }),
  rateLimit: z.object({
    perMinute: z.coerce.number(),
    scope: z.literal('apiKey'),
  }),
  scopes: z.array(ExternalScopeManifestItemSchema),
  endpoints: z.array(ExternalApiEndpointSchema),
});

export const IntegrationSandboxExampleSchema = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'DELETE']),
  path: z.string(),
  title: z.string(),
  description: z.string(),
  group: z.string(),
  scope: ApiKeyScopeSchema.or(z.string()),
  sandboxSupported: z.boolean(),
  sampleUrl: z.string(),
  curl: z.string(),
  requestExample: z.unknown().optional(),
  responseExample: z.unknown(),
});

export const IntegrationSandboxSchema = z.object({
  version: z.string(),
  baseUrl: z.string(),
  auth: z.object({
    apiKeyHeader: z.literal('x-api-key'),
    sandboxHeader: z.literal('x-sandbox-mode'),
    sandboxHeaderValue: z.literal('true'),
  }),
  outputs: z.object({
    manifestPath: z.literal('/api/api-keys/manifest'),
    openApiPath: z.literal('/api/api-keys/openapi.json'),
    postmanPath: z.literal('/api/api-keys/postman.json'),
  }),
  examples: z.array(IntegrationSandboxExampleSchema),
});

export const CreateApiKeySchema = z.object({
  name: z.string().trim().min(1),
  scopes: z.array(ApiKeyScopeSchema).optional(),
  expiresAt: z.string().trim().min(1).optional(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;
export type ApiKeyWithRaw = z.infer<typeof ApiKeyWithRawSchema>;
export type ApiKeyActivity = z.infer<typeof ApiKeyActivitySchema>;
export type CreateApiKeyDTO = z.infer<typeof CreateApiKeySchema>;
export type ExternalApiManifest = z.infer<typeof ExternalApiManifestSchema>;
export type IntegrationSandbox = z.infer<typeof IntegrationSandboxSchema>;
export type IntegrationSandboxExample = z.infer<typeof IntegrationSandboxExampleSchema>;

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

export async function getApiKeyActivity(id: string): Promise<ApiKeyActivity[]> {
  const res = await apiClient.get(`/api/api-keys/${id}/activity`);
  return safeParse(SingleResponseSchema(z.array(ApiKeyActivitySchema)), res.data, 'getApiKeyActivity').data;
}

export async function getExternalApiManifest(): Promise<ExternalApiManifest> {
  const res = await apiClient.get('/api/api-keys/manifest');
  return safeParse(SingleResponseSchema(ExternalApiManifestSchema), res.data, 'getExternalApiManifest').data;
}

export async function getExternalOpenApiSpec(): Promise<unknown> {
  const res = await apiClient.get('/api/api-keys/openapi.json');
  return res.data;
}

export async function getIntegrationSandbox(): Promise<IntegrationSandbox> {
  const res = await apiClient.get('/api/api-keys/sandbox');
  return safeParse(SingleResponseSchema(IntegrationSandboxSchema), res.data, 'getIntegrationSandbox').data;
}
