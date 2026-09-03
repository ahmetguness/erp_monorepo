import type { RecoveryAuditCandidate, RecoveryContext, RecoveryImpact, RecoverySnapshot } from './operation-recovery.types.js';

export interface OperationRecoveryRepository {
  recordExists(context: RecoveryContext): Promise<boolean>;
  listCandidates(context: RecoveryContext): Promise<RecoveryAuditCandidate[]>;
  getImpacts(context: RecoveryContext): Promise<RecoveryImpact[]>;
  restoreContact(context: RecoveryContext, auditLogId: string, expected: RecoverySnapshot | null, restore: RecoverySnapshot, action: 'UPDATE' | 'DELETE'): Promise<void>;
}
