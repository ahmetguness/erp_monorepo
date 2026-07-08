import { z } from 'zod';

export const API_KEY_CONTRACT_OWNER = 'packages/types/contracts/api-key.ts' as const;

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

export const CreateApiKeySchema = z.object({
  name: z.string().trim().min(1),
  scopes: z.array(ApiKeyScopeSchema).optional(),
  expiresAt: z.string().trim().min(1).optional(),
});

export type CreateApiKeyDTO = z.infer<typeof CreateApiKeySchema>;

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
  successfulRequestCount: z.coerce.number().optional(),
  errorCount: z.coerce.number().optional(),
  errorRate: z.coerce.number().optional(),
  rateLimitedCount: z.coerce.number().optional(),
  rateLimitPerMinute: z.coerce.number().optional(),
  lastRequestAt: z.string().nullable().optional(),
  lastIpAddress: z.string().nullable().optional(),
  lastStatus: z.coerce.number().nullable().optional(),
});

export const ApiKeyWithRawSchema = ApiKeySchema.extend({
  rawKey: z.string().optional(),
});

export const ApiKeyActivitySchema = z.object({
  id: z.string(),
  action: z.string(),
  newValues: z.unknown().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
});

export const ExternalHttpMethodSchema = z.enum(['GET', 'POST', 'PATCH', 'DELETE']);
export type ExternalHttpMethod = z.infer<typeof ExternalHttpMethodSchema>;

export const ExternalApiEndpointSummarySchema = z.object({
  method: ExternalHttpMethodSchema,
  path: z.string(),
  summary: z.string(),
  sandboxSupported: z.boolean(),
});

export const ExternalApiEndpointSchema = ExternalApiEndpointSummarySchema.extend({
  description: z.string(),
  scope: ApiKeyScopeSchema.or(z.string()),
  group: z.string(),
  queryExample: z.string().optional(),
  requestExample: z.unknown().optional(),
  responseExample: z.unknown(),
});

export const ExternalScopeManifestItemSchema = z.object({
  scope: ApiKeyScopeSchema.or(z.string()),
  label: z.string(),
  description: z.string(),
  endpoints: z.array(ExternalApiEndpointSummarySchema),
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

export type ApiKey = z.infer<typeof ApiKeySchema>;
export type ApiKeyWithRaw = z.infer<typeof ApiKeyWithRawSchema>;
export type ApiKeyActivity = z.infer<typeof ApiKeyActivitySchema>;
export type ExternalApiEndpoint = z.infer<typeof ExternalApiEndpointSchema>;
export type ExternalScopeManifestItem = z.infer<typeof ExternalScopeManifestItemSchema>;
export type ExternalApiManifest = z.infer<typeof ExternalApiManifestSchema>;
