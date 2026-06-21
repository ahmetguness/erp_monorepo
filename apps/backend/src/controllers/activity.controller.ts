import { Context } from 'hono';
import { EntityType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ValidationError } from '../errors';
import { ActivityService } from '../services/activity/index.js';
import { requireTenantId, requireUserId } from '../utils/context.js';

const ENTITY_TYPES: readonly EntityType[] = Object.values(EntityType);

function isEntityType(value: string | undefined): value is EntityType {
  return typeof value === 'string' && ENTITY_TYPES.includes(value as EntityType);
}

function parseLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(50, Math.max(1, parsed));
}

export const ActivityController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const entityType = c.req.query('entityType');
    const entityId = c.req.query('entityId');

    if (!isEntityType(entityType) || !entityId?.trim()) {
      return c.json(new ValidationError('Geçerli entityType ve entityId zorunludur.').toJSON(), 400);
    }

    const service = new ActivityService(prisma);
    const result = await service.list({
      tenantId,
      userId,
      entityType,
      entityId: entityId.trim(),
      limit: parseLimit(c.req.query('limit')),
    });

    return c.json(result);
  },
};
