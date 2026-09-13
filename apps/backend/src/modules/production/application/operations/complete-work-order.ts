import type { WorkOrderStatus } from '@prisma/client';

export type CompletionDecision = 'ALREADY_COMPLETED' | 'COMPLETE';

export function decideWorkOrderCompletion(status: WorkOrderStatus): CompletionDecision {
  return status === 'COMPLETED' ? 'ALREADY_COMPLETED' : 'COMPLETE';
}
