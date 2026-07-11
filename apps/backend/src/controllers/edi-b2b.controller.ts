import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { EdiB2BService } from '../services/edi-b2b.service.js';
import { NotFoundError, ValidationError } from '../errors';
import { requireTenantId, requireUserId } from '../utils/context.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readItemKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 160 ? trimmed : null;
}

export const EdiB2BController = {
  async hub(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const data = await new EdiB2BService(prisma).getHub(tenantId);
    return c.json({ data });
  },

  async retry(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body: unknown = await c.req.json().catch(() => null);
    if (!isRecord(body)) {
      return c.json(new ValidationError('Gecersiz B2B retry istegi.').toJSON(), 400);
    }

    const itemKey = readItemKey(body.itemKey);
    if (!itemKey) {
      return c.json(new ValidationError('itemKey zorunludur.').toJSON(), 400);
    }

    const data = await new EdiB2BService(prisma).createRetryTask(tenantId, userId, itemKey);
    if (!data) {
      return c.json(new NotFoundError('B2B hata kuyrugu kaydi', itemKey).toJSON(), 404);
    }

    return c.json({ data }, 201);
  },
};
