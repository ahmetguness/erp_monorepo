import { Context } from 'hono';
import { ForbiddenError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { SearchService } from '../../../../services/search.service.js';
import { UnifiedCommandService } from '../../application/unified-command/index.js';
import { PrismaUnifiedPermissionAdapter, PrismaUnifiedSearchAdapter } from '../../infrastructure/persistence/unified-command.adapters.js';
import { requireTenantId,requireUserId } from '../../../../utils/context.js';
import { z } from 'zod';

const searchService = new SearchService(prisma);
const unifiedCommandService = new UnifiedCommandService(new PrismaUnifiedSearchAdapter(prisma), new PrismaUnifiedPermissionAdapter());

const unifiedPreviewSchema = z.object({
  query: z.string().trim().max(500),
  limit: z.number().int().min(1).max(20).default(12),
  recentHrefs: z.array(z.string().max(500)).max(10).default([]),
});

const unifiedConfirmSchema = unifiedPreviewSchema.extend({
  intentId: z.string().min(1).max(80),
  selectedOptionId: z.string().min(1).max(80).nullable().default(null),
  confirmed: z.literal(true),
});

function parseLimit(rawValue: string | undefined): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(Math.max(Math.trunc(parsed), 1), 20);
}

export const SearchController = {
  async global(c: Context): Promise<Response> {
    const result = await searchService.global({
      tenantId: requireTenantId(c),
      userId: requireUserId(c),
      query: (c.req.query('q') ?? '').trim(),
      limit: parseLimit(c.req.query('limit')),
    });

    if (result instanceof ForbiddenError) return c.json(result.toJSON(), 403);
    return c.json(result);
  },

  async unified(c: Context): Promise<Response> {
    const parsed = unifiedPreviewSchema.safeParse(await c.req.json<unknown>());
    if (!parsed.success) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Geçersiz birleşik arama isteği.' } }, 400);
    const result = await unifiedCommandService.preview({ tenantId: requireTenantId(c), userId: requireUserId(c), ...parsed.data });
    if ('kind' in result) return c.json({ error: { code: result.kind, message: result.message } }, result.kind === 'FORBIDDEN' ? 403 : 400);
    return c.json({ data: result });
  },

  async confirmUnified(c: Context): Promise<Response> {
    const parsed = unifiedConfirmSchema.safeParse(await c.req.json<unknown>());
    if (!parsed.success) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Açık işlem onayı gereklidir.' } }, 400);
    const result = await unifiedCommandService.confirm({ tenantId: requireTenantId(c), userId: requireUserId(c), ...parsed.data });
    if ('kind' in result) return c.json({ error: { code: result.kind, message: result.message } }, result.kind === 'FORBIDDEN' ? 403 : 400);
    return c.json({ data: result });
  },
};
