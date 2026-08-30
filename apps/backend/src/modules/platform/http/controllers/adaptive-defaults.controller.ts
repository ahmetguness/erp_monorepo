import type { Context } from 'hono';
import { ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { getValidatedBody } from '../../../../middleware/validateBody.js';
import { requireTenantId, requireUserId } from '../../../../utils/context.js';
import { adaptiveDefaultsQuerySchema, dismissAdaptiveDefaultSchema } from '../../application/adaptive-defaults/index.js';
import { AdaptiveDefaultsService } from '../../infrastructure/persistence/adaptive-defaults.service.js';

export { dismissAdaptiveDefaultSchema };

export const AdaptiveDefaultsController = {
  async snapshot(c: Context): Promise<Response> {
    const parsed = adaptiveDefaultsQuerySchema.safeParse({
      formKind: c.req.query('formKind'),
      transactionType: c.req.query('transactionType'),
      contactId: c.req.query('contactId'),
    });
    if (!parsed.success) throw new ValidationError('Öğrenilen varsayılan sorgusu geçersiz.', { query: parsed.error.issues[0]?.message ?? 'Geçersiz sorgu.' });
    const snapshot = await new AdaptiveDefaultsService(prisma).snapshot({
      tenantId: requireTenantId(c),
      userId: requireUserId(c),
      ...parsed.data,
    });
    return c.json({ data: snapshot });
  },

  async dismiss(c: Context): Promise<Response> {
    const input = getValidatedBody(c, dismissAdaptiveDefaultSchema);
    await new AdaptiveDefaultsService(prisma).dismiss(requireTenantId(c), requireUserId(c), input.formKind, input.field);
    return c.json({ data: { success: true } });
  },

  async reset(c: Context): Promise<Response> {
    const count = await new AdaptiveDefaultsService(prisma).reset(requireTenantId(c), requireUserId(c));
    return c.json({ data: { success: true, count } });
  },
};
