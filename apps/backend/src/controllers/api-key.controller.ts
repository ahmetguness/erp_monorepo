import { Context } from 'hono';
import crypto from 'crypto';
import { AuditAction, EntityType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { requireTenantId, requireUserId, requireParam } from '../utils/context.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';
import { createApiKeyHash } from '../utils/api-key-hash.js';
import { getExternalApiManifest } from '../services/external-api-registry.service.js';
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
}

interface ApiKeyListQuery {
  page?: string;
  limit?: string;
  isActive?: string;
}

interface ApiKeyUsageStats {
  requestCount: number;
  errorCount: number;
  errorRate: number;
  lastIpAddress: string | null;
  lastStatus: number | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStatus(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const status = value.status;
  return typeof status === 'number' && Number.isFinite(status) ? status : null;
}

function emptyUsageStats(): ApiKeyUsageStats {
  return { requestCount: 0, errorCount: 0, errorRate: 0, lastIpAddress: null, lastStatus: null };
}

function parseCreateApiKeyBody(value: unknown): CreateApiKeyDTO | ValidationError {
  if (!isRecord(value)) return new ValidationError('Geçersiz istek gövdesi.');

  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const scopes = Array.isArray(value.scopes) && value.scopes.every((scope) => typeof scope === 'string')
    ? value.scopes
    : undefined;
  const expiresAt = typeof value.expiresAt === 'string' && value.expiresAt.trim() ? value.expiresAt : undefined;

  if (!name) return new ValidationError('name alanı zorunludur.');
  return { name, scopes, expiresAt };
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
          isActive: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          createdById: true,
          revokedAt: true,
          revokedById: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const apiKeyIds = apiKeys.map((apiKey) => apiKey.id);
    const usageLogs = apiKeyIds.length > 0
      ? await prisma.auditLog.findMany({
          where: {
            tenantId,
            module: 'api_keys',
            entityType: EntityType.OTHER,
            entityId: { in: apiKeyIds },
          },
          select: {
            entityId: true,
            newValues: true,
            ipAddress: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: Math.max(250, apiKeyIds.length * 50),
        })
      : [];

    const usageByKey = new Map<string, ApiKeyUsageStats>();
    for (const apiKey of apiKeys) usageByKey.set(apiKey.id, emptyUsageStats());
    for (const log of usageLogs) {
      const stats = usageByKey.get(log.entityId);
      if (!stats) continue;
      const status = readStatus(log.newValues);
      if (status === null) continue;
      stats.requestCount += 1;
      if (status >= 400) stats.errorCount += 1;
      if (stats.lastStatus === null) {
        stats.lastStatus = status;
        stats.lastIpAddress = log.ipAddress;
      }
    }

    const enrichedApiKeys = apiKeys.map((apiKey) => {
      const stats = usageByKey.get(apiKey.id) ?? emptyUsageStats();
      const errorRate = stats.requestCount > 0 ? Math.round((stats.errorCount / stats.requestCount) * 1000) / 10 : 0;
      return {
        ...apiKey,
        requestCount: stats.requestCount,
        errorCount: stats.errorCount,
        errorRate,
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

    // Generate random key
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = createApiKeyHash(rawKey);
    const keyPrefix = rawKey.substring(0, 8);

    const apiKey = await prisma.apiKey.create({
      data: {
        tenantId,
        name: body.name,
        keyHash,
        keyPrefix,
        scopes,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        createdById: userId,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        keyPrefix: true,
        scopes: true,
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
      newValues: { id: apiKey.id, name: apiKey.name, keyPrefix: apiKey.keyPrefix, scopes: apiKey.scopes, expiresAt: apiKey.expiresAt },
      ...getRequestMeta(c),
    });

    // Return raw key ONCE — it cannot be retrieved again
    return c.json({ data: { ...apiKey, rawKey } }, 201);
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
