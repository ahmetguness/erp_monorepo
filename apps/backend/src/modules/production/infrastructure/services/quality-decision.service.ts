import type { Prisma, PrismaClient, WorkOrderQualityStatus } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../../../../errors/index.js';
import type { QualityDecisionCommand } from '../../application/operations/quality-decision.js';

export async function lockWorkOrder(tx: Prisma.TransactionClient, tenantId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM work_orders WHERE id = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
  const order = await tx.workOrder.findFirst({ where: { tenantId, id, deletedAt: null } });
  if (!order) throw new NotFoundError('Work order', id);
  return order;
}

export function assertQualityReleased(status: WorkOrderQualityStatus): void {
  if (status === 'PENDING' || status === 'REJECTED') throw new ConflictError('Quality approval is required before finished goods can be released.');
}

export async function decideWorkOrderQuality(db: PrismaClient, tenantId: string, userId: string, id: string, input: QualityDecisionCommand) {
  return db.$transaction(async (tx) => {
    // Serializes retries on different work orders that reuse the same key too.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId + ':quality:' + input.idempotencyKey}, 0))`;
    const order = await lockWorkOrder(tx, tenantId, id);
    const previous = await tx.workOrderHistory.findFirst({ where: { tenantId, idempotencyKey: input.idempotencyKey } });
    if (previous) {
      if (previous.workOrderId !== id || previous.qualityDecision !== input.decision || previous.notes !== input.reason || previous.createdById !== userId) {
        throw new ConflictError('Quality idempotency key belongs to another decision.');
      }
      return previous;
    }
    if (order.status !== 'IN_PROGRESS' && order.status !== 'PAUSED') throw new ConflictError('Quality decisions require an active work order.');
    if (input.decision === 'APPROVED' && !order.producedQty.greaterThan(0)) throw new ValidationError('Quality approval requires reported output.');
    await tx.workOrder.updateMany({ where: { tenantId, id }, data: { qualityStatus: input.decision } });
    return tx.workOrderHistory.create({ data: {
      tenantId, workOrderId: id, fromStatus: order.status, toStatus: order.status,
      notes: input.reason, qualityDecision: input.decision, idempotencyKey: input.idempotencyKey, createdById: userId,
    } });
  });
}
