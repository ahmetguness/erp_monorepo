import { Context, Next } from 'hono';
import { AuditAction, EntityType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError } from '../errors';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';
import { createApiKeyHash, createLegacyApiKeyHash, isLegacyApiKeyHash } from '../utils/api-key-hash.js';
import { rateLimiter } from '../lib/rateLimiter.js';
import { getExternalApiRateLimitPerMinute } from '../services/external-api-registry.service.js';
import { isIpAllowedByAllowlist } from '../services/api-key-access.service.js';
import { getTrustedClientIpOrNull } from '../utils/request-ip.js';

const API_KEY_AUTH_FAILURE_LIMIT = 20;
const API_KEY_AUTH_FAILURE_WINDOW_MS = 60_000;

interface ApiKeyAccessAuditInput {
  tenantId: string;
  apiKeyId: string;
  method: string;
  path: string;
  status: number;
  scope?: string;
  reason?: string;
  clientIp?: string | null;
  denied?: boolean;
  rateLimited?: boolean;
  sandbox?: boolean;
}

function requestMethod(c: Context): string {
  return c.req.method.toUpperCase();
}

function authFailureRateLimitKey(clientIp: string | null): string {
  return `external_api_key_auth_failure:${clientIp ?? 'unknown'}`;
}

function normalizedRoutePath(path: string): string {
  return path
    .replace(/\/[a-z0-9]{20,}(?=\/|$)/gi, '/:id')
    .replace(/\/[0-9]+(?=\/|$)/g, '/:id');
}

function routeRateLimitKey(apiKeyId: string, c: Context): string {
  return `external_api_key_route:${apiKeyId}:${requestMethod(c)}:${normalizedRoutePath(c.req.path)}`;
}

async function isAuthFailureRateLimited(clientIp: string | null): Promise<boolean> {
  return rateLimiter.check(
    authFailureRateLimitKey(clientIp),
    API_KEY_AUTH_FAILURE_LIMIT,
    API_KEY_AUTH_FAILURE_WINDOW_MS,
  );
}

function auditApiKeyAccess(input: ApiKeyAccessAuditInput, c: Context): void {
  void createAuditLog(prisma, {
    tenantId: input.tenantId,
    userId: null,
    module: 'api_keys',
    entityType: EntityType.OTHER,
    entityId: input.apiKeyId,
    action: AuditAction.OTHER,
    newValues: {
      method: input.method,
      path: input.path,
      status: input.status,
      ...(input.scope && { scope: input.scope }),
      ...(input.reason && { reason: input.reason }),
      ...(input.clientIp !== undefined && { clientIp: input.clientIp }),
      ...(input.denied !== undefined && { denied: input.denied }),
      ...(input.rateLimited !== undefined && { rateLimited: input.rateLimited }),
      ...(input.sandbox !== undefined && { sandbox: input.sandbox }),
    },
    ...getRequestMeta(c),
  });
}

function actionForMethod(method: string): AuditAction {
  if (method === 'POST') return AuditAction.CREATE;
  if (method === 'PATCH' || method === 'PUT') return AuditAction.UPDATE;
  if (method === 'DELETE') return AuditAction.DELETE;
  return AuditAction.OTHER;
}

function isSandboxMode(c: Context): boolean {
  const header = c.req.header('x-sandbox-mode') ?? c.req.header('x-api-sandbox');
  return header === 'true' || header === '1';
}

export function authenticateApiKey() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const rawKey = c.req.header('x-api-key');
    const clientIp = getTrustedClientIpOrNull(c);

    if (!rawKey) {
      if (await isAuthFailureRateLimited(clientIp)) {
        return c.json({ error: { code: 'RATE_LIMITED', message: 'API key dogrulama denemesi limiti asildi.' } }, 429);
      }
      return c.json(new ForbiddenError('API anahtari bulunamadi. x-api-key header gerekli.').toJSON(), 401);
    }

    const keyHash = createApiKeyHash(rawKey);
    const legacyKeyHash = createLegacyApiKeyHash(rawKey);

    const apiKey = await prisma.apiKey.findFirst({
      where: {
        keyHash: { in: [keyHash, legacyKeyHash] },
        deletedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        scopes: true,
        ipAllowlist: true,
        keyHash: true,
        isActive: true,
        expiresAt: true,
      },
    });

    if (!apiKey) {
      if (await isAuthFailureRateLimited(clientIp)) {
        return c.json({ error: { code: 'RATE_LIMITED', message: 'API key dogrulama denemesi limiti asildi.' } }, 429);
      }
      return c.json(new ForbiddenError('Gecersiz veya suresi dolmus API anahtari.').toJSON(), 401);
    }

    if (!apiKey.isActive || (apiKey.expiresAt !== null && apiKey.expiresAt <= new Date())) {
      auditApiKeyAccess({
        tenantId: apiKey.tenantId,
        apiKeyId: apiKey.id,
        method: requestMethod(c),
        path: c.req.path,
        status: 401,
        denied: true,
        reason: apiKey.isActive ? 'expired' : 'inactive',
        clientIp,
      }, c);
      return c.json(new ForbiddenError('Gecersiz veya suresi dolmus API anahtari.').toJSON(), 401);
    }

    if (!isIpAllowedByAllowlist(clientIp, apiKey.ipAllowlist)) {
      auditApiKeyAccess({
        tenantId: apiKey.tenantId,
        apiKeyId: apiKey.id,
        method: requestMethod(c),
        path: c.req.path,
        status: 403,
        denied: true,
        reason: 'ip_allowlist',
        clientIp,
      }, c);
      return c.json(new ForbiddenError('Bu API anahtari bu IP adresinden kullanilamaz.').toJSON(), 403);
    }

    const shouldUpgradeLegacyHash = isLegacyApiKeyHash(rawKey, apiKey.keyHash);
    prisma.apiKey.update({
      where: { id: apiKey.id },
      data: {
        lastUsedAt: new Date(),
        ...(shouldUpgradeLegacyHash ? { keyHash } : {}),
      },
    }).catch(() => {});

    c.set('tenantId', apiKey.tenantId);
    c.set('apiKeyId', apiKey.id);
    c.set('apiKeyScopes', apiKey.scopes);
    c.set('apiKeyClientIp', clientIp);

    await next();
  };
}

export function apiKeyRateLimit() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const tenantId = c.get('tenantId');
    const apiKeyId = c.get('apiKeyId');
    if (typeof tenantId !== 'string' || typeof apiKeyId !== 'string') {
      return c.json(new ForbiddenError('API anahtari dogrulanamadi.').toJSON(), 401);
    }

    const perMinute = getExternalApiRateLimitPerMinute();
    const globalExceeded = await rateLimiter.check(`external_api_key:${apiKeyId}:global`, perMinute, 60_000);
    if (globalExceeded) {
      auditApiKeyAccess({
        tenantId,
        apiKeyId,
        method: requestMethod(c),
        path: c.req.path,
        status: 429,
        rateLimited: true,
        reason: 'global_rate_limit',
      }, c);
      return c.json({ error: { code: 'RATE_LIMITED', message: 'API key rate limit asildi. Lutfen biraz sonra tekrar deneyin.' } }, 429);
    }

    const routeExceeded = await rateLimiter.check(routeRateLimitKey(apiKeyId, c), perMinute, 60_000);
    if (routeExceeded) {
      auditApiKeyAccess({
        tenantId,
        apiKeyId,
        method: requestMethod(c),
        path: c.req.path,
        status: 429,
        rateLimited: true,
        reason: 'route_rate_limit',
      }, c);
      return c.json({ error: { code: 'RATE_LIMITED', message: 'API key rate limit asildi. Lutfen biraz sonra tekrar deneyin.' } }, 429);
    }

    await next();
  };
}

export function requireScope(scope: string) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const scopes: string[] = c.get('apiKeyScopes') ?? [];
    const tenantId = c.get('tenantId');
    const apiKeyId = c.get('apiKeyId');
    const method = requestMethod(c);

    if (!scopes.includes(scope)) {
      if (typeof tenantId === 'string' && typeof apiKeyId === 'string') {
        auditApiKeyAccess({
          tenantId,
          apiKeyId,
          method,
          path: c.req.path,
          status: 403,
          scope,
          denied: true,
          reason: 'missing_scope',
        }, c);
      }
      return c.json(
        new ForbiddenError(`Bu API anahtarinin '${scope}' yetkisi yok. Mevcut yetkiler: ${scopes.join(', ')}`).toJSON(),
        403,
      );
    }

    if (isSandboxMode(c) && method !== 'GET') {
      if (typeof tenantId === 'string' && typeof apiKeyId === 'string') {
        auditApiKeyAccess({
          tenantId,
          apiKeyId,
          method,
          path: c.req.path,
          status: 200,
          scope,
          sandbox: true,
        }, c);
      }

      return c.json({
        data: {
          sandbox: true,
          method,
          path: c.req.path,
          scope,
          message: 'Sandbox mode aktif. Scope dogrulandi, ancak veri degisikligi yapilmadi.',
        },
      });
    }

    try {
      await next();
    } finally {
      if (typeof tenantId !== 'string' || typeof apiKeyId !== 'string') return;
      void createAuditLog(prisma, {
        tenantId,
        userId: null,
        module: 'api_keys',
        entityType: EntityType.OTHER,
        entityId: apiKeyId,
        action: actionForMethod(method),
        newValues: {
          scope,
          method,
          path: c.req.path,
          status: c.res.status || 500,
        },
        ...getRequestMeta(c),
      });
    }
  };
}
