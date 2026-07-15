"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalApiManifestSchema = exports.ExternalScopeManifestItemSchema = exports.ExternalApiEndpointSchema = exports.ExternalApiEndpointSummarySchema = exports.ExternalHttpMethodSchema = exports.ApiKeyActivitySchema = exports.ApiKeyWithRawSchema = exports.ApiKeySchema = exports.CreateApiKeySchema = exports.ApiKeyScopeSchema = exports.API_KEY_SCOPE_VALUES = exports.API_KEY_CONTRACT_OWNER = void 0;
const zod_1 = require("zod");
exports.API_KEY_CONTRACT_OWNER = 'packages/types/contracts/api-key.ts';
exports.API_KEY_SCOPE_VALUES = [
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
];
exports.ApiKeyScopeSchema = zod_1.z.enum(exports.API_KEY_SCOPE_VALUES);
exports.CreateApiKeySchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1),
    scopes: zod_1.z.array(exports.ApiKeyScopeSchema).optional(),
    expiresAt: zod_1.z.string().trim().min(1).optional(),
    ipAllowlist: zod_1.z.array(zod_1.z.string().trim().min(1)).optional(),
});
exports.ApiKeySchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    keyPrefix: zod_1.z.string(),
    scopes: zod_1.z.array(exports.ApiKeyScopeSchema.or(zod_1.z.string())),
    ipAllowlist: zod_1.z.array(zod_1.z.string()).optional(),
    isActive: zod_1.z.boolean(),
    lastUsedAt: zod_1.z.string().nullable().optional(),
    expiresAt: zod_1.z.string().nullable().optional(),
    createdAt: zod_1.z.string(),
    updatedAt: zod_1.z.string().optional(),
    createdById: zod_1.z.string().nullable().optional(),
    revokedAt: zod_1.z.string().nullable().optional(),
    revokedById: zod_1.z.string().nullable().optional(),
    rotatedAt: zod_1.z.string().nullable().optional(),
    rotatedFromId: zod_1.z.string().nullable().optional(),
    requestCount: zod_1.z.coerce.number().optional(),
    successfulRequestCount: zod_1.z.coerce.number().optional(),
    errorCount: zod_1.z.coerce.number().optional(),
    errorRate: zod_1.z.coerce.number().optional(),
    rateLimitedCount: zod_1.z.coerce.number().optional(),
    rateLimitPerMinute: zod_1.z.coerce.number().optional(),
    lastRequestAt: zod_1.z.string().nullable().optional(),
    lastIpAddress: zod_1.z.string().nullable().optional(),
    lastStatus: zod_1.z.coerce.number().nullable().optional(),
});
exports.ApiKeyWithRawSchema = exports.ApiKeySchema.extend({
    rawKey: zod_1.z.string().optional(),
});
exports.ApiKeyActivitySchema = zod_1.z.object({
    id: zod_1.z.string(),
    action: zod_1.z.string(),
    newValues: zod_1.z.unknown().nullable(),
    ipAddress: zod_1.z.string().nullable(),
    userAgent: zod_1.z.string().nullable(),
    createdAt: zod_1.z.string(),
});
exports.ExternalHttpMethodSchema = zod_1.z.enum(['GET', 'POST', 'PATCH', 'DELETE']);
exports.ExternalApiEndpointSummarySchema = zod_1.z.object({
    method: exports.ExternalHttpMethodSchema,
    path: zod_1.z.string(),
    summary: zod_1.z.string(),
    sandboxSupported: zod_1.z.boolean(),
});
exports.ExternalApiEndpointSchema = exports.ExternalApiEndpointSummarySchema.extend({
    description: zod_1.z.string(),
    scope: exports.ApiKeyScopeSchema.or(zod_1.z.string()),
    group: zod_1.z.string(),
    queryExample: zod_1.z.string().optional(),
    requestExample: zod_1.z.unknown().optional(),
    responseExample: zod_1.z.unknown(),
});
exports.ExternalScopeManifestItemSchema = zod_1.z.object({
    scope: exports.ApiKeyScopeSchema.or(zod_1.z.string()),
    label: zod_1.z.string(),
    description: zod_1.z.string(),
    endpoints: zod_1.z.array(exports.ExternalApiEndpointSummarySchema),
});
exports.ExternalApiManifestSchema = zod_1.z.object({
    version: zod_1.z.string(),
    basePath: zod_1.z.string(),
    auth: zod_1.z.object({
        header: zod_1.z.literal('x-api-key'),
        sandboxHeader: zod_1.z.literal('x-sandbox-mode'),
    }),
    rateLimit: zod_1.z.object({
        perMinute: zod_1.z.coerce.number(),
        scope: zod_1.z.literal('apiKey'),
    }),
    scopes: zod_1.z.array(exports.ExternalScopeManifestItemSchema),
    endpoints: zod_1.z.array(exports.ExternalApiEndpointSchema),
});
