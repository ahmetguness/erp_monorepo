import { z } from 'zod';
export declare const API_KEY_CONTRACT_OWNER: "packages/types/contracts/api-key.ts";
export declare const API_KEY_SCOPE_VALUES: readonly ["products:read", "products:write", "products:delete", "contacts:read", "contacts:write", "contacts:delete", "invoices:read", "invoices:write", "invoices:delete", "inventory:read", "inventory:write", "orders:read", "orders:write"];
export declare const ApiKeyScopeSchema: z.ZodEnum<{
    "products:read": "products:read";
    "products:write": "products:write";
    "products:delete": "products:delete";
    "contacts:read": "contacts:read";
    "contacts:write": "contacts:write";
    "contacts:delete": "contacts:delete";
    "invoices:read": "invoices:read";
    "invoices:write": "invoices:write";
    "invoices:delete": "invoices:delete";
    "inventory:read": "inventory:read";
    "inventory:write": "inventory:write";
    "orders:read": "orders:read";
    "orders:write": "orders:write";
}>;
export type ApiKeyScope = z.infer<typeof ApiKeyScopeSchema>;
export declare const CreateApiKeySchema: z.ZodObject<{
    name: z.ZodString;
    scopes: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        "products:read": "products:read";
        "products:write": "products:write";
        "products:delete": "products:delete";
        "contacts:read": "contacts:read";
        "contacts:write": "contacts:write";
        "contacts:delete": "contacts:delete";
        "invoices:read": "invoices:read";
        "invoices:write": "invoices:write";
        "invoices:delete": "invoices:delete";
        "inventory:read": "inventory:read";
        "inventory:write": "inventory:write";
        "orders:read": "orders:read";
        "orders:write": "orders:write";
    }>>>;
    expiresAt: z.ZodOptional<z.ZodString>;
    ipAllowlist: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type CreateApiKeyDTO = z.infer<typeof CreateApiKeySchema>;
export declare const ApiKeySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    keyPrefix: z.ZodString;
    scopes: z.ZodArray<z.ZodUnion<[z.ZodEnum<{
        "products:read": "products:read";
        "products:write": "products:write";
        "products:delete": "products:delete";
        "contacts:read": "contacts:read";
        "contacts:write": "contacts:write";
        "contacts:delete": "contacts:delete";
        "invoices:read": "invoices:read";
        "invoices:write": "invoices:write";
        "invoices:delete": "invoices:delete";
        "inventory:read": "inventory:read";
        "inventory:write": "inventory:write";
        "orders:read": "orders:read";
        "orders:write": "orders:write";
    }>, z.ZodString]>>;
    ipAllowlist: z.ZodOptional<z.ZodArray<z.ZodString>>;
    isActive: z.ZodBoolean;
    lastUsedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    expiresAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodString;
    updatedAt: z.ZodOptional<z.ZodString>;
    createdById: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    revokedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    revokedById: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    rotatedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    rotatedFromId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    requestCount: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    successfulRequestCount: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    errorCount: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    errorRate: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    rateLimitedCount: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    rateLimitPerMinute: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    lastRequestAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    lastIpAddress: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    lastStatus: z.ZodOptional<z.ZodNullable<z.ZodCoercedNumber<unknown>>>;
}, z.core.$strip>;
export declare const ApiKeyWithRawSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    keyPrefix: z.ZodString;
    scopes: z.ZodArray<z.ZodUnion<[z.ZodEnum<{
        "products:read": "products:read";
        "products:write": "products:write";
        "products:delete": "products:delete";
        "contacts:read": "contacts:read";
        "contacts:write": "contacts:write";
        "contacts:delete": "contacts:delete";
        "invoices:read": "invoices:read";
        "invoices:write": "invoices:write";
        "invoices:delete": "invoices:delete";
        "inventory:read": "inventory:read";
        "inventory:write": "inventory:write";
        "orders:read": "orders:read";
        "orders:write": "orders:write";
    }>, z.ZodString]>>;
    ipAllowlist: z.ZodOptional<z.ZodArray<z.ZodString>>;
    isActive: z.ZodBoolean;
    lastUsedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    expiresAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodString;
    updatedAt: z.ZodOptional<z.ZodString>;
    createdById: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    revokedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    revokedById: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    rotatedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    rotatedFromId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    requestCount: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    successfulRequestCount: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    errorCount: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    errorRate: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    rateLimitedCount: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    rateLimitPerMinute: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    lastRequestAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    lastIpAddress: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    lastStatus: z.ZodOptional<z.ZodNullable<z.ZodCoercedNumber<unknown>>>;
    rawKey: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const ApiKeyActivitySchema: z.ZodObject<{
    id: z.ZodString;
    action: z.ZodString;
    newValues: z.ZodNullable<z.ZodUnknown>;
    ipAddress: z.ZodNullable<z.ZodString>;
    userAgent: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export declare const ExternalHttpMethodSchema: z.ZodEnum<{
    GET: "GET";
    POST: "POST";
    PATCH: "PATCH";
    DELETE: "DELETE";
}>;
export type ExternalHttpMethod = z.infer<typeof ExternalHttpMethodSchema>;
export declare const ExternalApiEndpointSummarySchema: z.ZodObject<{
    method: z.ZodEnum<{
        GET: "GET";
        POST: "POST";
        PATCH: "PATCH";
        DELETE: "DELETE";
    }>;
    path: z.ZodString;
    summary: z.ZodString;
    sandboxSupported: z.ZodBoolean;
}, z.core.$strip>;
export declare const ExternalApiEndpointSchema: z.ZodObject<{
    method: z.ZodEnum<{
        GET: "GET";
        POST: "POST";
        PATCH: "PATCH";
        DELETE: "DELETE";
    }>;
    path: z.ZodString;
    summary: z.ZodString;
    sandboxSupported: z.ZodBoolean;
    description: z.ZodString;
    scope: z.ZodUnion<[z.ZodEnum<{
        "products:read": "products:read";
        "products:write": "products:write";
        "products:delete": "products:delete";
        "contacts:read": "contacts:read";
        "contacts:write": "contacts:write";
        "contacts:delete": "contacts:delete";
        "invoices:read": "invoices:read";
        "invoices:write": "invoices:write";
        "invoices:delete": "invoices:delete";
        "inventory:read": "inventory:read";
        "inventory:write": "inventory:write";
        "orders:read": "orders:read";
        "orders:write": "orders:write";
    }>, z.ZodString]>;
    group: z.ZodString;
    queryExample: z.ZodOptional<z.ZodString>;
    requestExample: z.ZodOptional<z.ZodUnknown>;
    responseExample: z.ZodUnknown;
}, z.core.$strip>;
export declare const ExternalScopeManifestItemSchema: z.ZodObject<{
    scope: z.ZodUnion<[z.ZodEnum<{
        "products:read": "products:read";
        "products:write": "products:write";
        "products:delete": "products:delete";
        "contacts:read": "contacts:read";
        "contacts:write": "contacts:write";
        "contacts:delete": "contacts:delete";
        "invoices:read": "invoices:read";
        "invoices:write": "invoices:write";
        "invoices:delete": "invoices:delete";
        "inventory:read": "inventory:read";
        "inventory:write": "inventory:write";
        "orders:read": "orders:read";
        "orders:write": "orders:write";
    }>, z.ZodString]>;
    label: z.ZodString;
    description: z.ZodString;
    endpoints: z.ZodArray<z.ZodObject<{
        method: z.ZodEnum<{
            GET: "GET";
            POST: "POST";
            PATCH: "PATCH";
            DELETE: "DELETE";
        }>;
        path: z.ZodString;
        summary: z.ZodString;
        sandboxSupported: z.ZodBoolean;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const ExternalApiManifestSchema: z.ZodObject<{
    version: z.ZodString;
    basePath: z.ZodString;
    auth: z.ZodObject<{
        header: z.ZodLiteral<"x-api-key">;
        sandboxHeader: z.ZodLiteral<"x-sandbox-mode">;
    }, z.core.$strip>;
    rateLimit: z.ZodObject<{
        perMinute: z.ZodCoercedNumber<unknown>;
        scope: z.ZodLiteral<"apiKey">;
    }, z.core.$strip>;
    scopes: z.ZodArray<z.ZodObject<{
        scope: z.ZodUnion<[z.ZodEnum<{
            "products:read": "products:read";
            "products:write": "products:write";
            "products:delete": "products:delete";
            "contacts:read": "contacts:read";
            "contacts:write": "contacts:write";
            "contacts:delete": "contacts:delete";
            "invoices:read": "invoices:read";
            "invoices:write": "invoices:write";
            "invoices:delete": "invoices:delete";
            "inventory:read": "inventory:read";
            "inventory:write": "inventory:write";
            "orders:read": "orders:read";
            "orders:write": "orders:write";
        }>, z.ZodString]>;
        label: z.ZodString;
        description: z.ZodString;
        endpoints: z.ZodArray<z.ZodObject<{
            method: z.ZodEnum<{
                GET: "GET";
                POST: "POST";
                PATCH: "PATCH";
                DELETE: "DELETE";
            }>;
            path: z.ZodString;
            summary: z.ZodString;
            sandboxSupported: z.ZodBoolean;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    endpoints: z.ZodArray<z.ZodObject<{
        method: z.ZodEnum<{
            GET: "GET";
            POST: "POST";
            PATCH: "PATCH";
            DELETE: "DELETE";
        }>;
        path: z.ZodString;
        summary: z.ZodString;
        sandboxSupported: z.ZodBoolean;
        description: z.ZodString;
        scope: z.ZodUnion<[z.ZodEnum<{
            "products:read": "products:read";
            "products:write": "products:write";
            "products:delete": "products:delete";
            "contacts:read": "contacts:read";
            "contacts:write": "contacts:write";
            "contacts:delete": "contacts:delete";
            "invoices:read": "invoices:read";
            "invoices:write": "invoices:write";
            "invoices:delete": "invoices:delete";
            "inventory:read": "inventory:read";
            "inventory:write": "inventory:write";
            "orders:read": "orders:read";
            "orders:write": "orders:write";
        }>, z.ZodString]>;
        group: z.ZodString;
        queryExample: z.ZodOptional<z.ZodString>;
        requestExample: z.ZodOptional<z.ZodUnknown>;
        responseExample: z.ZodUnknown;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ApiKey = z.infer<typeof ApiKeySchema>;
export type ApiKeyWithRaw = z.infer<typeof ApiKeyWithRawSchema>;
export type ApiKeyActivity = z.infer<typeof ApiKeyActivitySchema>;
export type ExternalApiEndpoint = z.infer<typeof ExternalApiEndpointSchema>;
export type ExternalScopeManifestItem = z.infer<typeof ExternalScopeManifestItemSchema>;
export type ExternalApiManifest = z.infer<typeof ExternalApiManifestSchema>;
