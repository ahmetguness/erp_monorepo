import { AuditAction, EntityType, Prisma } from '@prisma/client';

// ─────────────────────────────────────────────
// Audit Formatter — Ortak Tip Tanımları
// ─────────────────────────────────────────────

/** Bir alandaki değer değişimini iş diliyle temsil eder. */
export interface AuditChange {
  field: string;
  label: string;
  oldValue: string | null;
  newValue: string | null;
  /** Satır kaynağı (ör. "3. satır") — line item değişimlerinde doldurulur. */
  lineContext: string | null;
}

/** formatAuditLogBusiness'ın döndürdüğü zenginleştirilmiş özet. */
export interface BusinessAuditSummary {
  actionLabel: string;
  moduleLabel: string;
  entityTypeLabel: string;
  /** İş diliyle okunabilir özet cümlesi. */
  summary: string;
  /** Tüm değişim listesi (birden fazla alan değişmişse). */
  changes: AuditChange[];
}

/**
 * Alan ID'si → Değer ID'si → İnsan Okunabilir Etiket.
 * Örn: labels.get('contactId')?.get('abc-123') === 'ABC Ltd.'
 */
export type AuditFieldValueLabels = ReadonlyMap<string, ReadonlyMap<string, string>>;

/** formatAuditLogBusiness'a geçilen girdi. */
export interface AuditFormatInput {
  action: AuditAction;
  module: string;
  entityType: EntityType;
  entityLabel: string | null;
  userLabel: string | null;
  oldValues: Prisma.JsonValue | null;
  newValues: Prisma.JsonValue | null;
  fieldValueLabels?: AuditFieldValueLabels;
}

/** Alan tipi sınıflandırması — formatlama kararları için kullanılır. */
export type AuditFieldKind = 'boolean' | 'date' | 'money' | 'percent' | 'quantity' | 'reference' | 'status' | 'text';
