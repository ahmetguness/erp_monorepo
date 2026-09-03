import { ConflictError, NotFoundError, ValidationError } from '../../../errors/index.js';
import type { OperationRecoveryRepository } from './operation-recovery.ports.js';
import type { RecoveryAuditCandidate, RecoveryChange, RecoveryContext, RecoveryItem, RecoveryValue } from './operation-recovery.types.js';

const UNDO_WINDOW_MS = 15 * 60 * 1000;
const LABELS: Readonly<Record<string, string>> = { name: 'Unvan', code: 'Kod', taxNumber: 'Vergi no', taxOffice: 'Vergi dairesi', email: 'E-posta', phone: 'Telefon', website: 'Web sitesi', address: 'Adres', city: 'Şehir', country: 'Ülke', notes: 'Notlar', creditLimit: 'Kredi limiti', paymentTermDays: 'Vade günü', isActive: 'Aktiflik' };

function changes(candidate: RecoveryAuditCandidate): RecoveryChange[] {
  const before = candidate.oldValues ?? {};
  const after = candidate.newValues ?? {};
  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter((field) => before[field] !== after[field])
    .map((field) => ({ field, label: LABELS[field] ?? field, before: before[field] as RecoveryValue, after: after[field] as RecoveryValue }));
}

function toItem(candidate: RecoveryAuditCandidate, impacts: RecoveryItem['impacts'], now: Date): RecoveryItem {
  const expiresAt = new Date(candidate.createdAt.getTime() + UNDO_WINDOW_MS);
  const recoverable = candidate.entityType === 'CONTACT' && candidate.oldValues !== null;
  const expired = expiresAt.getTime() <= now.getTime();
  const financial = ['INVOICE', 'PURCHASE_ORDER', 'SALES_ORDER', 'DELIVERY_NOTE'].includes(candidate.entityType);
  const mode = recoverable ? 'UNDO' : financial ? 'COMPENSATE' : 'UNAVAILABLE';
  const canExecute = mode === 'UNDO' && !expired && candidate.recoveredAt === null;
  const explanation = candidate.recoveredAt ? 'Bu değişiklik daha önce geri alındı.' : expired && mode === 'UNDO' ? '15 dakikalık güvenli geri alma süresi doldu.' : mode === 'COMPENSATE' ? 'Finansal veya yasal kayıt doğrudan silinmez; ters kayıt ya da iptal akışı kullanılmalıdır.' : mode === 'UNDO' ? 'Kayıt sonradan değişmediyse önceki sürüm güvenle geri yüklenebilir.' : 'Bu kayıt türü için otomatik geri alma desteklenmiyor.';
  return { auditLogId: candidate.id, mode, title: candidate.action === 'DELETE' ? 'Kayıt silindi' : 'Kayıt güncellendi', explanation, canExecute, expiresAt: mode === 'UNDO' ? expiresAt.toISOString() : null, occurredAt: candidate.createdAt.toISOString(), changes: changes(candidate), impacts };
}

export class OperationRecoveryService {
  constructor(private readonly repository: OperationRecoveryRepository) {}

  async list(context: RecoveryContext): Promise<RecoveryItem[]> {
    if (!(await this.repository.recordExists(context))) throw new NotFoundError('Kayıt', context.entityId);
    const [candidates, impacts] = await Promise.all([this.repository.listCandidates(context), this.repository.getImpacts(context)]);
    return candidates.map((candidate) => toItem(candidate, impacts, new Date()));
  }

  async undo(context: RecoveryContext, auditLogId: string): Promise<{ restored: true }> {
    const candidate = (await this.repository.listCandidates(context)).find((item) => item.id === auditLogId);
    if (!candidate) throw new NotFoundError('Geri alma kaydı', auditLogId);
    const item = toItem(candidate, await this.repository.getImpacts(context), new Date());
    if (item.mode !== 'UNDO') throw new ValidationError(item.explanation);
    if (!item.canExecute) throw new ConflictError(item.explanation);
    if (!candidate.oldValues) throw new ValidationError('Önceki sürüm bulunamadı.');
    await this.repository.restoreContact(context, auditLogId, candidate.newValues, candidate.oldValues, candidate.action);
    return { restored: true };
  }
}
