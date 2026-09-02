import type { Context } from 'hono';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma.js';
import { requireTenantId, requireUserId } from '../../../../utils/context.js';
import { NavigationWorkspaceService } from '../../application/navigation-workspace/index.js';
import { PrismaNavigationWorkspaceRepository } from '../../infrastructure/persistence/prisma-navigation-workspace.repository.js';

const service = new NavigationWorkspaceService(new PrismaNavigationWorkspaceRepository(prisma));
const personaSchema = z.enum(['AUTO', 'SALES', 'FINANCE', 'OPERATIONS', 'PEOPLE', 'MANAGEMENT']);
const preferencesSchema = z.object({ persona: personaSchema, favoriteHrefs: z.array(z.string().max(300)).max(12), hiddenModules: z.array(z.string().max(50)).max(30) });
const activitySchema = z.object({ href: z.string().min(1).max(500) });

function failure(c: Context, result: { kind: 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION'; message: string }): Response {
  const status = result.kind === 'FORBIDDEN' ? 403 : result.kind === 'NOT_FOUND' ? 404 : 400;
  return c.json({ error: { code: result.kind, message: result.message } }, status);
}

export const NavigationWorkspaceController = {
  async get(c: Context): Promise<Response> {
    const result = await service.get(requireTenantId(c), requireUserId(c));
    return 'kind' in result ? failure(c, result) : c.json({ data: result });
  },

  async update(c: Context): Promise<Response> {
    const parsed = preferencesSchema.safeParse(await c.req.json<unknown>());
    if (!parsed.success) return c.json({ error: { code: 'VALIDATION', message: 'Geçersiz navigasyon tercihleri.' } }, 400);
    const result = await service.update(requireTenantId(c), requireUserId(c), parsed.data);
    return 'kind' in result ? failure(c, result) : c.json({ data: result });
  },

  async activity(c: Context): Promise<Response> {
    const parsed = activitySchema.safeParse(await c.req.json<unknown>());
    if (!parsed.success) return c.json({ error: { code: 'VALIDATION', message: 'Geçersiz navigasyon hedefi.' } }, 400);
    const result = await service.recordActivity(requireTenantId(c), requireUserId(c), parsed.data.href);
    return result ? failure(c, result) : c.body(null, 204);
  },

  async distribute(c: Context): Promise<Response> {
    const parsed = preferencesSchema.safeParse(await c.req.json<unknown>());
    if (!parsed.success) return c.json({ error: { code: 'VALIDATION', message: 'Geçersiz menü profili.' } }, 400);
    const roleId = c.req.param('roleId');
    if (!roleId) return c.json({ error: { code: 'VALIDATION', message: 'Rol kimliği gereklidir.' } }, 400);
    const result = await service.distribute(requireTenantId(c), requireUserId(c), roleId, parsed.data);
    return 'kind' in result ? failure(c, result) : c.json({ data: result });
  },
};
