import { ValidationError } from '../../../../errors/index.js';
import { findDuplicateCandidates } from './duplicate-matcher.js';
import type { ContactFieldWinners, DataDeduplicationRepository, DedupEntity } from './data-deduplication.types.js';

export class DataDeduplicationService {
  constructor(private readonly repository: DataDeduplicationRepository) {}
  async scan(tenantId: string, entity: DedupEntity, threshold = 0.15) {
    return findDuplicateCandidates(entity, await this.repository.listRecords(tenantId, entity), threshold);
  }
  previewContactMerge(tenantId: string, sourceId: string, targetId: string, fieldWinners: ContactFieldWinners) {
    if (sourceId === targetId) throw new ValidationError('Kaynak ve hedef cari farklı olmalıdır.');
    return this.repository.previewContactMerge(tenantId, sourceId, targetId, fieldWinners);
  }
  mergeContacts(context: { tenantId: string; userId: string; ipAddress: string | null; userAgent: string | null }, sourceId: string, targetId: string, fieldWinners: ContactFieldWinners) {
    if (sourceId === targetId) throw new ValidationError('Kaynak ve hedef cari farklı olmalıdır.');
    return this.repository.mergeContacts(context, sourceId, targetId, fieldWinners);
  }
  rollbackContactMerge(context: { tenantId: string; userId: string; ipAddress: string | null; userAgent: string | null }, auditLogId: string) {
    return this.repository.rollbackContactMerge(context, auditLogId);
  }
}
