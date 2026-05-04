import { Context } from 'hono';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';
import { requireTenantId } from '../utils/context.js';

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

// ─────────────────────────────────────────────
// API Key Controller
// ─────────────────────────────────────────────

export const ApiKeyController = {
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

    return c.json({
      data: apiKeys,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<CreateApiKeyDTO>();

    if (!body.name) {
      return c.json(new ValidationError('name alanı zorunludur.').toJSON(), 400);
    }

    // Generate random key
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 8);

    const apiKey = await prisma.apiKey.create({
      data: {
        tenantId,
        name: body.name,
        keyHash,
        keyPrefix,
        scopes: body.scopes ?? [],
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
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

    // Return raw key ONCE — it cannot be retrieved again
    return c.json({ data: { ...apiKey, rawKey } }, 201);
  },

  async revoke(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const existing = await prisma.apiKey.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!existing) return c.json(new NotFoundError('API Key', id).toJSON(), 404);

    const updated = await prisma.apiKey.update({
      where: { id },
      data: { isActive: false, revokedAt: new Date() },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        isActive: true,
        revokedAt: true,
      },
    });

    return c.json({ data: updated });
  },

  async delete(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const existing = await prisma.apiKey.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!existing) return c.json(new NotFoundError('API Key', id).toJSON(), 404);

    await prisma.apiKey.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return c.json({ data: { success: true } });
  },
};
