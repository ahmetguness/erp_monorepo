import type { Context } from 'hono';
import { prisma } from '../../../lib/prisma.js';
import { requireParam, requireTenantId, requireUserId } from '../../../utils/context.js';
import { RecordCollaborationService } from '../application/index.js';
import { PrismaRecordCollaborationRepository } from '../infrastructure/persistence/index.js';
import { parseCreateEntryBody, parseEntityType, parseFollowingBody } from './record-collaboration.schemas.js';

const service = new RecordCollaborationService(new PrismaRecordCollaborationRepository(prisma));

function context(c: Context) {
  return { tenantId: requireTenantId(c), userId: requireUserId(c), entityType: parseEntityType(requireParam(c, 'entityType')), entityId: requireParam(c, 'entityId') };
}

export const RecordCollaborationController = {
  async get(c: Context): Promise<Response> {
    return c.json({ data: await service.getSnapshot(context(c)) });
  },
  async createEntry(c: Context): Promise<Response> {
    const body = parseCreateEntryBody(await c.req.json<unknown>());
    return c.json({ data: await service.createEntry({ ...context(c), ...body }) }, 201);
  },
  async follow(c: Context): Promise<Response> {
    const following = parseFollowingBody(await c.req.json<unknown>());
    return c.json({ data: { following: await service.setFollowing({ ...context(c), following }) } });
  },
};
