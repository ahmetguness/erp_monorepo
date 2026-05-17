import { Context, Next } from 'hono';
import crypto from 'crypto';
import { AuditAction, EntityType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError } from '../errors';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';

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
      return c.json(
        new ForbiddenError(`Bu API anahtarının '${scope}' yetkisi yok. Mevcut yetkiler: ${scopes.join(', ')}`).toJSON(),
        403,
      );
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
