export type DedupEntity = 'contacts' | 'products' | 'invoices';
export type MatchStrength = 'exact' | 'similar';

export interface DedupRecord {
  id: string;
  label: string;
  values: Readonly<Record<string, string | number | null>>;
}

export interface DedupReason {
  field: string;
  strength: MatchStrength;
  weight: number;
  description: string;
}

export interface DuplicateCandidate {
  id: string;
  entity: DedupEntity;
  left: DedupRecord;
  right: DedupRecord;
  score: number;
  risk: 'low' | 'medium' | 'high';
  reasons: DedupReason[];
  mergeSupported: boolean;
  mergeBlockedReason: string | null;
}

export type ContactMergeField = 'name' | 'taxNumber' | 'taxOffice' | 'email' | 'phone' | 'website' | 'address' | 'city' | 'country' | 'notes' | 'creditLimit' | 'paymentTermDays';
export type MergeWinner = 'source' | 'target';
export type ContactFieldWinners = Partial<Record<ContactMergeField, MergeWinner>>;

export interface ContactMergePlan {
  source: DedupRecord;
  target: DedupRecord;
  fieldWinners: ContactFieldWinners;
  mergedValues: Readonly<Record<ContactMergeField, string | number | null>>;
  references: Readonly<Record<string, number>>;
  totalReferences: number;
  warnings: string[];
  rollbackSupported: true;
}

export interface ContactMergeResult extends ContactMergePlan {
  auditLogId: string;
  mergedAt: string;
}

export interface ContactMergeRollbackResult {
  auditLogId: string;
  restoredSourceId: string;
  targetId: string;
  restoredReferences: number;
  rolledBackAt: string;
}

export interface DataDeduplicationRepository {
  listRecords(tenantId: string, entity: DedupEntity): Promise<DedupRecord[]>;
  previewContactMerge(tenantId: string, sourceId: string, targetId: string, fieldWinners: ContactFieldWinners): Promise<ContactMergePlan>;
  mergeContacts(context: { tenantId: string; userId: string; ipAddress: string | null; userAgent: string | null }, sourceId: string, targetId: string, fieldWinners: ContactFieldWinners): Promise<ContactMergeResult>;
  rollbackContactMerge(context: { tenantId: string; userId: string; ipAddress: string | null; userAgent: string | null }, auditLogId: string): Promise<ContactMergeRollbackResult>;
}
