import { Prisma } from '@prisma/client';
import type { AuditFieldValueLabels } from './types.js';
import { FIELD_KINDS, STATUS_LABELS, FIELD_LABELS, HIDDEN_FIELDS } from './field-registry.js';

// ─────────────────────────────────────────────
// Audit Field Value Formatter
// JSON değerlerini iş diline çevirir.
// ─────────────────────────────────────────────

export function isJsonObject(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isJsonArray(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonArray {
  return Array.isArray(value);
}

/** camelCase alan adından okunabilir etiket üretir. */
export function labelFromKey(key: string): string {
  const leafKey = key.split('.').at(-1) ?? key;
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  if (FIELD_LABELS[leafKey]) return FIELD_LABELS[leafKey];
  return leafKey
    .replace(/Id$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (letter) => letter.toLocaleUpperCase('tr-TR'));
}

export function isMoneyField(field: string): boolean {
  const leafKey = field.split('.').at(-1) ?? field;
  if (FIELD_KINDS[field] === 'money' || FIELD_KINDS[leafKey] === 'money') return true;
  const lower = field.toLowerCase();
  return lower.includes('price') || lower.includes('amount') || lower.includes('total') || lower.includes('cost');
}

export function isDateField(field: string): boolean {
  const leafKey = field.split('.').at(-1) ?? field;
  if (FIELD_KINDS[field] === 'date' || FIELD_KINDS[leafKey] === 'date') return true;
  const lower = field.toLowerCase();
  return lower.includes('date') || lower.includes('until') || lower.endsWith('at');
}

export function isQuantityField(field: string): boolean {
  const leafKey = field.split('.').at(-1) ?? field;
  if (FIELD_KINDS[field] === 'quantity' || FIELD_KINDS[leafKey] === 'quantity') return true;
  const lower = field.toLowerCase();
  return lower.includes('quantity') || lower.includes('stock') || lower.includes('count');
}

export function isPercentField(field: string): boolean {
  const leafKey = field.split('.').at(-1) ?? field;
  return FIELD_KINDS[field] === 'percent' || FIELD_KINDS[leafKey] === 'percent';
}

export function isReferenceField(field: string): boolean {
  const leafKey = field.split('.').at(-1) ?? field;
  return FIELD_KINDS[field] === 'reference' || FIELD_KINDS[leafKey] === 'reference' || leafKey.endsWith('Id');
}

export function isStatusField(field: string): boolean {
  const leafKey = field.split('.').at(-1) ?? field;
  return FIELD_KINDS[field] === 'status' || FIELD_KINDS[leafKey] === 'status';
}

export function isVisibleField(field: string): boolean {
  const leafKey = field.split('.').at(-1) ?? field;
  return !HIDDEN_FIELDS.has(field) && !HIDDEN_FIELDS.has(leafKey);
}

function referenceLabel(field: string, value: string, labels: AuditFieldValueLabels | undefined): string | null {
  const leafKey = field.split('.').at(-1) ?? field;
  return labels?.get(field)?.get(value) ?? labels?.get(leafKey)?.get(value) ?? null;
}

function formatDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'percent',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value / 100);
}

/** Tek bir JSON değerini iş diline çevirir. */
export function formatJsonValue(
  field: string,
  value: Prisma.JsonValue | undefined,
  labels: AuditFieldValueLabels | undefined,
): string | null {
  if (value === undefined || value === null) return null;

  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';

  if (typeof value === 'number') {
    if (isMoneyField(field)) return formatMoney(value);
    if (isPercentField(field)) return formatPercent(value);
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: isQuantityField(field) ? 3 : 2 }).format(value);
  }

  if (typeof value === 'string') {
    if (isReferenceField(field)) {
      return referenceLabel(field, value, labels) ?? (value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value);
    }
    if (isStatusField(field) && STATUS_LABELS[value]) return STATUS_LABELS[value];
    if (isMoneyField(field)) {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) return formatMoney(numeric);
    }
    if (isPercentField(field)) {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) return formatPercent(numeric);
    }
    if (isQuantityField(field)) {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(numeric);
    }
    if (isDateField(field)) return formatDate(value) ?? value;
    return value;
  }

  if (Array.isArray(value)) return `${value.length} öğe`;
  return 'detay';
}

/** İki değerin eşit olup olmadığını kontrol eder. */
export function valuesEqual(
  left: Prisma.JsonValue | undefined,
  right: Prisma.JsonValue | undefined,
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}
