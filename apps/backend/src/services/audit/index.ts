// ─────────────────────────────────────────────
// audit/ — Public API
// ─────────────────────────────────────────────

export type {
  AuditChange,
  BusinessAuditSummary,
  AuditFieldValueLabels,
  AuditFormatInput,
  AuditFieldKind,
} from './types.js';

export {
  formatAuditLogBusiness,
  getModuleLabel,
  getEntityTypeLabel,
} from './formatter.js';

export { resolveAuditFieldValueLabels } from './field-label-resolver.js';

export {
  MODULE_LABELS,
  ENTITY_LABELS,
  ACTION_LABELS,
  ACTION_VERBS,
  FIELD_LABELS,
  FIELD_KINDS,
  STATUS_LABELS,
  IMPORTANT_FIELDS,
  HIDDEN_FIELDS,
} from './field-registry.js';
