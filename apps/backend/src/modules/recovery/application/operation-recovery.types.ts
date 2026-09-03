export type RecoveryEntityType = 'INVOICE' | 'PRODUCT' | 'CATEGORY' | 'CONTACT' | 'EMPLOYEE' | 'CUSTOMER_ASSET' | 'SERVICE_REQUEST' | 'PURCHASE_ORDER' | 'SALES_QUOTE' | 'SALES_ORDER' | 'WORK_ORDER' | 'DELIVERY_NOTE' | 'OTHER';
export type RecoveryValue = string | number | boolean | null;
export type RecoverySnapshot = Record<string, RecoveryValue>;
export type RecoveryMode = 'UNDO' | 'COMPENSATE' | 'UNAVAILABLE';

export interface RecoveryAuditCandidate {
  id: string;
  action: 'UPDATE' | 'DELETE';
  entityType: RecoveryEntityType;
  entityId: string;
  oldValues: RecoverySnapshot | null;
  newValues: RecoverySnapshot | null;
  createdAt: Date;
  recoveredAt: Date | null;
}

export interface RecoveryChange { field: string; label: string; before: RecoveryValue; after: RecoveryValue }
export interface RecoveryImpact { label: string; count: number }
export interface RecoveryItem {
  auditLogId: string;
  mode: RecoveryMode;
  title: string;
  explanation: string;
  canExecute: boolean;
  expiresAt: string | null;
  occurredAt: string;
  changes: RecoveryChange[];
  impacts: RecoveryImpact[];
}

export interface RecoveryContext { tenantId: string; userId: string; entityType: RecoveryEntityType; entityId: string }
