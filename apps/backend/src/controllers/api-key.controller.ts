import { Context } from 'hono';
import { AuditAction, EntityType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { requireTenantId, requireUserId, requireParam } from '../utils/context.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';
import { getExternalApiManifest } from '../services/external-api-registry.service.js';
import { ApiKeyUsageService } from '../services/api-key-usage.service.js';
import { generateApiKeyMaterial, validateIpAllowlist } from '../services/api-key-access.service.js';
import {
  getIntegrationSandboxOpenApiDocument,
  getIntegrationSandboxPayload,
  getIntegrationSandboxPostmanCollection,
} from '../services/integration-sandbox.service.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface CreateApiKeyDTO {
  name: string;
  scopes?: string[];
  expiresAt?: string;
  ipAllowlist?: string[];
}

interface ApiKeyListQuery {
  page?: string;
  limit?: string;
  isActive?: string;
}

const VALID_API_KEY_SCOPES = new Set([
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
]);

const apiKeyUsageService = new ApiKeyUsageService(prisma);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCreateApiKeyBody(value: unknown): CreateApiKeyDTO | ValidationError {
  if (!isRecord(value)) return new ValidationError('Geçersiz istek gövdesi.');

  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const scopes = Array.isArray(value.scopes) && value.scopes.every((scope) => typeof scope === 'string')
    ? value.scopes
    : undefined;
  const expiresAt = typeof value.expiresAt === 'string' && value.expiresAt.trim() ? value.expiresAt : undefined;
  const ipAllowlist = Array.isArray(value.ipAllowlist) && value.ipAllowlist.every((entry) => typeof entry === 'string')
    ? value.ipAllowlist
    : undefined;

  if (!name) return new ValidationError('name alanı zorunludur.');
  return { name, scopes, expiresAt, ipAllowlist };
}

// ─────────────────────────────────────────────
// API Key Controller
// ─────────────────────────────────────────────

export const ApiKeyController = {
  async manifest(c: Context): Promise<Response> {
    return c.json({ data: getExternalApiManifest() });
  },

  async openApi(c: Context): Promise<Response> {
    const origin = new URL(c.req.url).origin;
    return c.json(getIntegrationSandboxOpenApiDocument(origin));
  },

  async sandbox(c: Context): Promise<Response> {
    const origin = new URL(c.req.url).origin;
    return c.json({ data: getIntegrationSandboxPayload(origin) });
  },

  async postman(c: Context): Promise<Response> {
    const origin = new URL(c.req.url).origin;
    c.header('Content-Disposition', 'attachment; filename="axon-erp-external-api.postman_collection.json"');
    return c.json(getIntegrationSandboxPostmanCollection(origin));
  },

  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as ApiKeyListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      deletedAt: null,
      ...(query.isActive !== undefined && { isActive: query.isActive === 'true' }),
    };

    const [total, apiKeys] = await prisma.$transaction([
      prisma.apiKey.count({ where }),
      prisma.apiKey.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          ipAllowlist: true,
          isActive: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          createdById: true,
          revokedAt: true,
          revokedById: true,
          rotatedAt: true,
          rotatedFromId: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const usageByKey = await apiKeyUsageService.getStatsByApiKey(tenantId, apiKeys.map((apiKey) => apiKey.id));
    const manifest = getExternalApiManifest();

    const enrichedApiKeys = apiKeys.map((apiKey) => {
      const stats = usageByKey.get(apiKey.id) ?? apiKeyUsageService.emptyStats();
      return {
        ...apiKey,
        requestCount: stats.requestCount,
        successfulRequestCount: stats.successfulRequestCount,
        errorCount: stats.errorCount,
        errorRate: stats.errorRate,
        rateLimitedCount: stats.rateLimitedCount,
        rateLimitPerMinute: manifest.rateLimit.perMinute,
        lastRequestAt: stats.lastRequestAt,
        lastIpAddress: stats.lastIpAddress,
        lastStatus: stats.lastStatus,
      };
    });

    return c.json({
      data: enrichedApiKeys,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    const parsed = parseCreateApiKeyBody(await c.req.json<unknown>().catch(() => null));
    if (parsed instanceof ValidationError) return c.json(parsed.toJSON(), 400);
    const body = parsed;

    const scopes = body.scopes ?? [];
    if (scopes.length === 0) {
      return c.json(new ValidationError('En az bir API scope secilmelidir.').toJSON(), 400);
    }

    const invalidScopes = scopes.filter((scope) => !VALID_API_KEY_SCOPES.has(scope));
    if (invalidScopes.length > 0) {
      return c.json(new ValidationError(`Gecersiz API scope: ${invalidScopes.join(', ')}`).toJSON(), 400);
    }

    const ipAllowlist = validateIpAllowlist(body.ipAllowlist);
    if (ipAllowlist.invalidEntries.length > 0) {
      return c.json(new ValidationError(`Gecersiz IP allowlist kaydi: ${ipAllowlist.invalidEntries.join(', ')}`).toJSON(), 400);
    }

    const keyMaterial = generateApiKeyMaterial();

    const apiKey = await prisma.apiKey.create({
      data: {
        tenantId,
        name: body.name,
        keyHash: keyMaterial.keyHash,
        keyPrefix: keyMaterial.keyPrefix,
        scopes,
        ipAllowlist: ipAllowlist.values,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        createdById: userId,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        ipAllowlist: true,
        isActive: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'api_keys',
      entityType: EntityType.OTHER,
      entityId: apiKey.id,
      action: AuditAction.CREATE,
      newValues: { id: apiKey.id, name: apiKey.name, keyPrefix: apiKey.keyPrefix, scopes: apiKey.scopes, ipAllowlist: apiKey.ipAllowlist, expiresAt: apiKey.expiresAt },
      ...getRequestMeta(c),
    });

    // Return raw key ONCE — it cannot be retrieved again
    return c.json({ data: { ...apiKey, rawKey: keyMaterial.rawKey } }, 201);
  },

  async rotate(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.apiKey.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) return c.json(new NotFoundError('API Key', id).toJSON(), 404);
    if (!existing.isActive || existing.revokedAt) {
      return c.json(new ValidationError('Sadece aktif API anahtarlari rotate edilebilir.').toJSON(), 400);
    }

    const keyMaterial = generateApiKeyMaterial();
    const now = new Date();

    const [rotated] = await prisma.$transaction([
      prisma.apiKey.create({
        data: {
          tenantId,
          name: existing.name,
          keyHash: keyMaterial.keyHash,
          keyPrefix: keyMaterial.keyPrefix,
          scopes: existing.scopes,
          ipAllowlist: existing.ipAllowlist,
          expiresAt: existing.expiresAt,
          createdById: userId,
          rotatedFromId: existing.id,
        },
        select: {
          id: true,
          tenantId: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          ipAllowlist: true,
          isActive: true,
          expiresAt: true,
          createdAt: true,
          rotatedFromId: true,
        },
      }),
      prisma.apiKey.update({
        where: { id: existing.id },
        data: { isActive: false, revokedAt: now, revokedById: userId, rotatedAt: now },
      }),
    ]);

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'api_keys',
      entityType: EntityType.OTHER,
      entityId: existing.id,
      action: AuditAction.UPDATE,
      oldValues: { id: existing.id, name: existing.name, isActive: existing.isActive, keyPrefix: existing.keyPrefix },
      newValues: { rotatedToId: rotated.id, rotatedToPrefix: rotated.keyPrefix, rotatedAt: now, scopes: rotated.scopes, ipAllowlist: rotated.ipAllowlist },
      ...getRequestMeta(c),
    });

    return c.json({ data: { ...rotated, rawKey: keyMaterial.rawKey } }, 201);
  },

  async activity(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.apiKey.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return c.json(new NotFoundError('API Key', id).toJSON(), 404);

    const logs = await prisma.auditLog.findMany({
      where: { tenantId, module: 'api_keys', entityType: EntityType.OTHER, entityId: id },
      select: {
        id: true,
        action: true,
        newValues: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    return c.json({ data: logs });
  },

  async revoke(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.apiKey.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!existing) return c.json(new NotFoundError('API Key', id).toJSON(), 404);

    const updated = await prisma.apiKey.update({
      where: { id },
      data: { isActive: false, revokedAt: new Date(), revokedById: userId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        isActive: true,
        revokedAt: true,
      },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'api_keys',
      entityType: EntityType.OTHER,
      entityId: id,
      action: AuditAction.UPDATE,
      oldValues: { id, name: existing.name, isActive: existing.isActive, scopes: existing.scopes },
      newValues: { id: updated.id, name: updated.name, isActive: updated.isActive, revokedAt: updated.revokedAt },
      ...getRequestMeta(c),
    });

    return c.json({ data: updated });
  },

  async delete(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.apiKey.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!existing) return c.json(new NotFoundError('API Key', id).toJSON(), 404);

    await prisma.apiKey.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'api_keys',
      entityType: EntityType.OTHER,
      entityId: id,
      action: AuditAction.DELETE,
      oldValues: { id, name: existing.name, keyPrefix: existing.keyPrefix, scopes: existing.scopes },
      ...getRequestMeta(c),
    });

    return c.json({ data: { success: true } });
  },
};
