import { AuditAction, EntityType, Prisma } from '@prisma/client';
import type { AuditChange, BusinessAuditSummary, AuditFormatInput } from './types.js';
import {
  MODULE_LABELS,
  ENTITY_LABELS,
  ACTION_LABELS,
  ACTION_VERBS,
  IMPORTANT_FIELDS,
} from './field-registry.js';
import {
  formatJsonValue,
  isJsonObject,
  isVisibleField,
  labelFromKey,
  valuesEqual,
} from './field-value-formatter.js';
import { buildLineChanges } from './line-diff.js';

// ─────────────────────────────────────────────
// Audit Log Formatter
// JSON audit verilerini iş diliyle özetler.
// ─────────────────────────────────────────────

function flattenRecord(record: Prisma.JsonObject, prefix = ''): Record<string, Prisma.JsonValue> {
  const flattened: Record<string, Prisma.JsonValue> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    const field = prefix ? `${prefix}.${key}` : key;
    if (isJsonObject(value)) {
      Object.assign(flattened, flattenRecord(value, field));
    } else {
      flattened[field] = value;
    }
  }
  return flattened;
}

function sortFields(fields: string[]): string[] {
  return fields.sort((left, right) => {
    const leftKey = left.split('.').at(-1) ?? left;
    const rightKey = right.split('.').at(-1) ?? right;
    const leftIndex = IMPORTANT_FIELDS.indexOf(leftKey);
    const rightIndex = IMPORTANT_FIELDS.indexOf(rightKey);
    if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
    if (leftIndex >= 0) return -1;
    if (rightIndex >= 0) return 1;
    return left.localeCompare(right, 'tr');
  });
}

function buildTopLevelChanges(
  action: AuditAction,
  oldValues: Prisma.JsonValue | null,
  newValues: Prisma.JsonValue | null,
  labels: AuditFormatInput['fieldValueLabels'],
): AuditChange[] {
  const oldRecord = isJsonObject(oldValues) ? flattenRecord(oldValues) : {};
  const newRecord = isJsonObject(newValues) ? flattenRecord(newValues) : {};

  const fields = sortFields(
    Array.from(new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)])),
  )
    .filter(isVisibleField)
    .filter((field) => action !== AuditAction.UPDATE || !valuesEqual(oldRecord[field], newRecord[field]))
    .slice(0, 8);

  return fields.map((field): AuditChange => ({
    field,
    label: labelFromKey(field),
    oldValue: formatJsonValue(field, oldRecord[field], labels),
    newValue: formatJsonValue(field, newRecord[field], labels),
    lineContext: null,
  }));
}

function fallbackEntityLabel(entityType: EntityType, entityLabel: string | null): string {
  return entityLabel ?? ENTITY_LABELS[entityType];
}

function firstImpactChange(changes: AuditChange[]): AuditChange | null {
  // Satır değişimleri olmayan, üst düzey değişimleri önceliklendir
  const topLevel = changes.filter((c) => c.lineContext === null);
  const withImpact = topLevel.find((change) =>
    IMPORTANT_FIELDS.includes(change.field.split('.').at(-1) ?? change.field),
  );
  return withImpact ?? topLevel[0] ?? changes[0] ?? null;
}

function possessiveEntity(entityType: EntityType, entity: string): string {
  if (entityType === EntityType.INVOICE) return `${entity} faturasının`;
  if (entityType === EntityType.PRODUCT) return `${entity} ürününün`;
  if (entityType === EntityType.CONTACT) return `${entity} carisinin`;
  if (entityType === EntityType.SALES_QUOTE) return `${entity} teklifinin`;
  if (entityType === EntityType.SALES_ORDER) return `${entity} satış siparişinin`;
  if (entityType === EntityType.PURCHASE_ORDER) return `${entity} satın alma siparişinin`;
  if (entityType === EntityType.EMPLOYEE) return `${entity} personelinin`;
  return `${entity} kaydının`;
}

function impactVerb(field: string): string {
  const leafKey = field.split('.').at(-1) ?? field;
  if (leafKey === 'dueDate') return 'vadesini';
  if (leafKey === 'validUntil') return 'geçerlilik tarihini';
  if (leafKey === 'status') return 'durumunu';
  if (leafKey === 'totalGross') return 'genel toplamını';
  if (leafKey === 'totalNet') return 'ara toplamını';
  if (leafKey === 'contactId') return 'carisini';
  if (leafKey === 'productId') return 'ürününü';
  if (leafKey === 'assignedToId') return 'atanan kullanıcısını';
  if (leafKey === 'warehouseId') return 'deposunu';
  if (leafKey === 'categoryId') return 'kategorisini';
  return `${labelFromKey(field).toLocaleLowerCase('tr-TR')} alanını`;
}

function buildSummary(input: AuditFormatInput, changes: AuditChange[]): string {
  const actor = input.userLabel ?? (input.module === 'api_keys' ? 'API anahtarı' : 'Sistem');
  const entity = fallbackEntityLabel(input.entityType, input.entityLabel);

  if (input.action === AuditAction.LOGIN || input.action === AuditAction.LOGOUT) {
    return `${actor} ${ACTION_VERBS[input.action]}.`;
  }

  const impact = firstImpactChange(changes);

  if (input.action === AuditAction.UPDATE && impact && impact.oldValue !== null && impact.newValue !== null) {
    // Satır değişimi varsa özel format
    if (impact.lineContext) {
      return `${actor} ${possessiveEntity(input.entityType, entity)} ${impact.lineContext} ${labelFromKey(impact.field).toLocaleLowerCase('tr-TR')} alanını ${impact.oldValue}'den ${impact.newValue}'e değiştirdi.`;
    }
    return `${actor} ${possessiveEntity(input.entityType, entity)} ${impactVerb(impact.field)} ${impact.oldValue} → ${impact.newValue} olarak değiştirdi.`;
  }

  if (input.action === AuditAction.CREATE && impact?.newValue) {
    return `${actor} ${entity} kaydını oluşturdu (${impact.label}: ${impact.newValue}).`;
  }

  if (input.action === AuditAction.DELETE) {
    return `${actor} ${entity} kaydını sildi.`;
  }

  if (input.action === AuditAction.APPROVE) {
    return `${actor} ${entity} kaydını onayladı.`;
  }

  if (input.action === AuditAction.REJECT) {
    return `${actor} ${entity} kaydını reddetti.`;
  }

  return `${actor} ${entity} üzerinde ${ACTION_VERBS[input.action]}.`;
}

export function getModuleLabel(module: string): string {
  return MODULE_LABELS[module] ?? labelFromKey(module);
}

export function getEntityTypeLabel(entityType: EntityType): string {
  return ENTITY_LABELS[entityType];
}

/**
 * Audit log kaydını iş diliyle özetler.
 * Hem üst düzey alan değişimleri hem de nested satır değişimleri raporlanır.
 */
export function formatAuditLogBusiness(input: AuditFormatInput): BusinessAuditSummary {
  const topLevelChanges = buildTopLevelChanges(
    input.action,
    input.oldValues,
    input.newValues,
    input.fieldValueLabels,
  );

  // Satır (line item) değişimlerini ekle — yalnızca UPDATE'de anlamlı
  const lineChanges =
    input.action === AuditAction.UPDATE
      ? buildLineChanges(input.oldValues, input.newValues, input.fieldValueLabels)
      : [];

  const changes = [...topLevelChanges, ...lineChanges];

  return {
    actionLabel: ACTION_LABELS[input.action],
    moduleLabel: getModuleLabel(input.module),
    entityTypeLabel: getEntityTypeLabel(input.entityType),
    summary: buildSummary(input, changes),
    changes,
  };
}
