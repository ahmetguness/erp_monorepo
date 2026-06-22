import { Context, Next } from 'hono';
import crypto from 'crypto';
import { AuditAction, EntityType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError } from '../errors';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';
import { rateLimiter } from '../lib/rateLimiter.js';
import { getExternalApiRateLimitPerMinute } from '../services/external-api-registry.service.js';

/**
 * API Key authentication middleware.
 * Reads `x-api-key` header, hashes it with SHA256, and looks up the matching key.
 * Sets tenantId and apiKeyId on the context if valid.
 *
 * Usage: Can be used as an alternative to JWT auth for programmatic access.
 *   app.use('/api/external/*', authenticateApiKey());
 */
export function authenticateApiKey() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const rawKey = c.req.header('x-api-key');

    if (!rawKey) {
      return c.json(new ForbiddenError('API anahtarı bulunamadı. x-api-key header gerekli.').toJSON(), 401);
    }

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await prisma.apiKey.findFirst({
      where: {
        keyHash,
        isActive: true,
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: {
        id: true,
        tenantId: true,
        scopes: true,
        lastUsedAt: true,
      },
    });

    if (!apiKey) {
      return c.json(new ForbiddenError('Geçersiz veya süresi dolmuş API anahtarı.').toJSON(), 401);
    }

    // Update lastUsedAt (fire-and-forget)
    prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {});

    // Set context for downstream handlers
    c.set('tenantId', apiKey.tenantId);
    c.set('apiKeyId', apiKey.id);
    c.set('apiKeyScopes', apiKey.scopes);

    await next();
  };
}

function isSandboxMode(c: Context): boolean {
  const header = c.req.header('x-sandbox-mode') ?? c.req.header('x-api-sandbox');
  return header === 'true' || header === '1';
}

function getSandboxAction(method: string): AuditAction {
  if (method === 'POST') return AuditAction.CREATE;
  if (method === 'PATCH' || method === 'PUT') return AuditAction.UPDATE;
  if (method === 'DELETE') return AuditAction.DELETE;
  return AuditAction.OTHER;
}

export function apiKeyRateLimit() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const tenantId = c.get('tenantId');
    const apiKeyId = c.get('apiKeyId');
    if (typeof tenantId !== 'string' || typeof apiKeyId !== 'string') {
      return c.json(new ForbiddenError('API anahtari dogrulanamadi.').toJSON(), 401);
    }

    const exceeded = await rateLimiter.check(
      `external_api_key:${apiKeyId}`,
      getExternalApiRateLimitPerMinute(),
      60_000,
    );
    if (exceeded) {
      void createAuditLog(prisma, {
        tenantId,
        userId: null,
        module: 'api_keys',
        entityType: EntityType.OTHER,
        entityId: apiKeyId,
        action: AuditAction.OTHER,
        newValues: {
          method: c.req.method.toUpperCase(),
          path: c.req.path,
          status: 429,
          rateLimited: true,
        },
        ...getRequestMeta(c),
      });
      return c.json({ error: { code: 'RATE_LIMITED', message: 'API key rate limit asildi. Lutfen biraz sonra tekrar deneyin.' } }, 429);
    }

    await next();
  };
}

/**
 * Scope check middleware. Use after authenticateApiKey().
 * Checks if the API key has the required scope.
 *
 * Usage: app.get('/api/external/invoices', requireScope('invoices:read'), handler)
 */
export function requireScope(scope: string) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const scopes: string[] = c.get('apiKeyScopes') ?? [];

    if (!scopes.includes(scope)) {
      const tenantId = c.get('tenantId');
      const apiKeyId = c.get('apiKeyId');
      if (typeof tenantId === 'string' && typeof apiKeyId === 'string') {
        void createAuditLog(prisma, {
          tenantId,
          userId: null,
          module: 'api_keys',
          entityType: EntityType.OTHER,
          entityId: apiKeyId,
          action: AuditAction.OTHER,
          newValues: {
            scope,
            method: c.req.method.toUpperCase(),
            path: c.req.path,
            status: 403,
            denied: true,
          },
          ...getRequestMeta(c),
        });
      }
      return c.json(
        new ForbiddenError(`Bu API anahtarının '${scope}' yetkisi yok. Mevcut yetkiler: ${scopes.join(', ')}`).toJSON(),
        403,
      );
    }

    const sandboxMethod = c.req.method.toUpperCase();
    if (isSandboxMode(c) && sandboxMethod !== 'GET') {
      const tenantId = c.get('tenantId');
      const apiKeyId = c.get('apiKeyId');
      if (typeof tenantId === 'string' && typeof apiKeyId === 'string') {
        void createAuditLog(prisma, {
          tenantId,
          userId: null,
          module: 'api_keys',
          entityType: EntityType.OTHER,
          entityId: apiKeyId,
          action: getSandboxAction(sandboxMethod),
          newValues: {
            scope,
            method: sandboxMethod,
            path: c.req.path,
            status: 200,
            sandbox: true,
          },
          ...getRequestMeta(c),
        });
      }

      return c.json({
        data: {
          sandbox: true,
          method: sandboxMethod,
          path: c.req.path,
          scope,
          message: 'Sandbox mode aktif. Scope dogrulandi, ancak veri degisikligi yapilmadi.',
        },
      });
    }

    await next();

    const tenantId = c.get('tenantId');
    const apiKeyId = c.get('apiKeyId');
    if (typeof tenantId !== 'string' || typeof apiKeyId !== 'string') return;

    const method = c.req.method.toUpperCase();
    const action =
      method === 'GET' ? AuditAction.OTHER :
      method === 'POST' ? AuditAction.CREATE :
      method === 'PATCH' || method === 'PUT' ? AuditAction.UPDATE :
      method === 'DELETE' ? AuditAction.DELETE :
      AuditAction.OTHER;

    void createAuditLog(prisma, {
      tenantId,
      userId: null,
      module: 'api_keys',
      entityType: EntityType.OTHER,
      entityId: apiKeyId,
      action,
      newValues: {
        scope,
        method,
        path: c.req.path,
        status: c.res.status,
      },
      ...getRequestMeta(c),
    });
  };
}
