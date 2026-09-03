import type { Context } from 'hono';
import { prisma } from '../../../lib/prisma.js';
import { requireParam, requireTenantId, requireUserId } from '../../../utils/context.js';
import { OperationRecoveryService } from '../application/index.js';
import { PrismaOperationRecoveryRepository } from '../infrastructure/persistence/index.js';
import { parseRecoveryEntityType } from './operation-recovery.schemas.js';

const service = new OperationRecoveryService(new PrismaOperationRecoveryRepository(prisma));
function recoveryContext(c: Context) { return { tenantId: requireTenantId(c), userId: requireUserId(c), entityType: parseRecoveryEntityType(requireParam(c, 'entityType')), entityId: requireParam(c, 'entityId') }; }

export const OperationRecoveryController = {
  async list(c: Context): Promise<Response> { return c.json({ data: await service.list(recoveryContext(c)) }); },
  async undo(c: Context): Promise<Response> { return c.json({ data: await service.undo(recoveryContext(c), requireParam(c, 'auditLogId')) }); },
};
