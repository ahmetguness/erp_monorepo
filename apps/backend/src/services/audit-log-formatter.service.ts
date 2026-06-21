/**
 * @deprecated Bu dosya backward-compat için korunmaktadır.
 * Yeni kodlar için: import { formatAuditLogBusiness } from './audit/index.js'
 */
export {
  formatAuditLogBusiness,
  getModuleLabel,
  getEntityTypeLabel,
} from './audit/index.js';

export type {
  AuditChange,
  BusinessAuditSummary,
  AuditFieldValueLabels,
  AuditFormatInput,
  AuditFieldKind,
} from './audit/index.js';
