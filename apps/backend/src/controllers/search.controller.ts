import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { ForbiddenError } from '../errors';
import { requireTenantId, requireUserId } from '../utils/context.js';
import { SearchService } from '../services/search.service.js';

const searchService = new SearchService(prisma);

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
};
