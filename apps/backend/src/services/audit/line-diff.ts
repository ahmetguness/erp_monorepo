import { Prisma } from '@prisma/client';
import type { AuditChange, AuditFieldValueLabels } from './types.js';
import {
  formatJsonValue,
  isJsonObject,
  isJsonArray,
  isVisibleField,
  labelFromKey,
  valuesEqual,
} from './field-value-formatter.js';
import { IMPORTANT_FIELDS } from './field-registry.js';

// ─────────────────────────────────────────────
// Audit Line Diff
// İç içe geçmiş satır (lines[], items[]) dizilerindeki
// değişiklikleri iş diliyle özetler.
// "2. satır ürün miktarı 5'ten 7'ye çıkarıldı"
// ─────────────────────────────────────────────

/** Audit JSON içinde satır dizisi barındıran olası alan adları. */
const LINE_ARRAY_FIELDS: ReadonlySet<string> = new Set(['lines', 'items', 'orderItems', 'quoteItems']);

/** Satır sırasını insan okunabilir hale getirir. */
function lineOrdinal(index: number): string {
  return `${index + 1}. satır`;
}

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

/** İki satır nesnesi arasındaki görünür alan farklarını döner. */
function diffLineObjects(
  oldLine: Prisma.JsonObject,
  newLine: Prisma.JsonObject,
  lineContext: string,
  labels: AuditFieldValueLabels | undefined,
): AuditChange[] {
  const oldFlat = flattenRecord(oldLine);
  const newFlat = flattenRecord(newLine);
  const allFields = Array.from(new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)]));

  return allFields
    .filter(isVisibleField)
    .filter((field) => !valuesEqual(oldFlat[field], newFlat[field]))
    .map((field): AuditChange => ({
      field,
      label: labelFromKey(field),
      oldValue: formatJsonValue(field, oldFlat[field], labels),
      newValue: formatJsonValue(field, newFlat[field], labels),
      lineContext,
    }));
}

/**
 * Eski ve yeni satır dizilerini karşılaştırır.
 * Satırlar `id` alanı ile eşleştirilir; yoksa index kullanılır.
 */
function matchLines(
  oldLines: Prisma.JsonArray,
  newLines: Prisma.JsonArray,
): Array<{ oldLine: Prisma.JsonObject | null; newLine: Prisma.JsonObject | null; index: number }> {
  // id bazlı eşleştirme
  const oldById = new Map<string, Prisma.JsonObject>();
  const oldOrdered: Array<Prisma.JsonObject | null> = [];
  for (const item of oldLines) {
    if (isJsonObject(item)) {
      oldOrdered.push(item);
      if (typeof item['id'] === 'string') oldById.set(item['id'], item);
    } else {
      oldOrdered.push(null);
    }
  }

  const newById = new Map<string, Prisma.JsonObject>();
  const newOrdered: Array<Prisma.JsonObject | null> = [];
  for (const item of newLines) {
    if (isJsonObject(item)) {
      newOrdered.push(item);
      if (typeof item['id'] === 'string') newById.set(item['id'], item);
    } else {
      newOrdered.push(null);
    }
  }

  const usedOldIds = new Set<string>();
  const result: Array<{ oldLine: Prisma.JsonObject | null; newLine: Prisma.JsonObject | null; index: number }> = [];

  newOrdered.forEach((newLine, idx) => {
    if (!newLine) return;
    const newId = typeof newLine['id'] === 'string' ? newLine['id'] : null;
    let matched: Prisma.JsonObject | null = null;
    if (newId && oldById.has(newId) && !usedOldIds.has(newId)) {
      matched = oldById.get(newId) ?? null;
      usedOldIds.add(newId);
    } else if (!newId) {
      matched = oldOrdered[idx] ?? null;
    }
    result.push({ oldLine: matched, newLine, index: idx });
  });

  return result;
}

/**
 * oldValues ve newValues içindeki satır dizilerini bulur ve
 * karşılaştırmalı AuditChange listesi üretir.
 * Maksimum 10 satır değişimi raporlanır.
 */
export function buildLineChanges(
  oldValues: Prisma.JsonValue | null,
  newValues: Prisma.JsonValue | null,
  labels: AuditFieldValueLabels | undefined,
): AuditChange[] {
  if (!isJsonObject(oldValues) || !isJsonObject(newValues)) return [];

  const changes: AuditChange[] = [];

  for (const arrayField of LINE_ARRAY_FIELDS) {
    const oldArray = oldValues[arrayField];
    const newArray = newValues[arrayField];

    if (!isJsonArray(oldArray) || !isJsonArray(newArray)) continue;

    const pairs = matchLines(oldArray, newArray);

    for (const { oldLine, newLine, index } of pairs) {
      if (!newLine) continue;
      const context = lineOrdinal(index);

      if (!oldLine) {
        // Yeni satır eklendi
        const productId = typeof newLine['productId'] === 'string' ? newLine['productId'] : null;
        const productLabel = productId ? (labels?.get('productId')?.get(productId) ?? null) : null;
        changes.push({
          field: arrayField,
          label: 'Yeni satır',
          oldValue: null,
          newValue: productLabel ? `${productLabel} eklendi` : `${context} eklendi`,
          lineContext: context,
        });
        continue;
      }

      const lineChanges = diffLineObjects(oldLine, newLine, context, labels);
      changes.push(...lineChanges);

      if (changes.length >= 10) break;
    }

    if (changes.length > 0) break; // İlk bulunan satır dizisi yeterli
  }

  return changes.slice(0, 10);
}
