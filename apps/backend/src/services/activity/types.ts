import { EntityType } from '@prisma/client';

// ─────────────────────────────────────────────
// Activity — Ortak Tip Tanımları
// ─────────────────────────────────────────────

/** Aktivite kaynağı — hangi modülden geldiğini belirtir. */
export type ActivitySource =
  | 'AUDIT'
  | 'ATTACHMENT'
  | 'MAIL'
  | 'TASK'
  | 'NOTIFICATION'
  | 'APPROVAL'
  | 'PAYMENT'
  | 'SERVICE';

/** Aktivite görsel tonu — UI'da renk/ikon seçimi için. */
export type ActivityTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info';

/**
 * İş önemi seviyesi — timeline sıralama ve vurgulama için.
 * - high: finansal, onay/red, silme, durum değişimi gibi kritik olaylar
 * - medium: güncelleme, görev, mail gibi orta önem
 * - low: dosya eki, bildirim, görev oluşturma gibi düşük önem
 */
export type ActivityImportance = 'low' | 'medium' | 'high';

/**
 * Timeline'da bir aktivite öğesini temsil eden standart tip.
 * Her kaynak (AUDIT, PAYMENT, MAIL, ...) bu yapıya map edilir.
 */
export interface ActivityItem {
  /** Birleşik benzersiz kimlik: "{source}:{id}" */
  id: string;
  /** Kaynak tipi (ActivitySource ile aynı). */
  source: ActivitySource;
  /** Kaynak tipi (ActivitySource ile aynı — backward compat). */
  sourceType: ActivitySource;
  /** Kaynak tablosundaki özgün ID. */
  sourceId: string;
  /** UI tonu. */
  tone: ActivityTone;
  /** İş diliyle kısa başlık (businessSummary ile aynı). */
  title: string;
  /** İş diliyle okunabilir özet cümlesi. */
  businessSummary: string;
  /** Kullanıcıya gösterilecek detay — iş dilinde ek bilgi. */
  description: string | null;
  /**
   * Teknik detay — yalnızca audit kayıtlarında değişen alanların
   * ham listesi ("Alan: Eski → Yeni" formatı). Diğer kaynaklarda null.
   */
  technicalDetails: string | null;
  /** Kullanıcı görünen adı (ad soyad + e-posta). */
  actorLabel: string | null;
  /** İşlemi yapan kullanıcı ID. */
  actorId: string | null;
  /** Kaynak modül adı. */
  module: string | null;
  /** İlgili entity tipi. */
  entityType: EntityType;
  /** İlgili entity ID. */
  entityId: string;
  /** Oluşma zamanı (ISO 8601). */
  occurredAt: string;
  /** Aktiviteye ait detay sayfası bağlantısı — varsa. */
  href: string | null;
  /** İş önemi seviyesi. */
  importance: ActivityImportance;
}

/** Servis listesi için girdi parametreleri. */
export interface ActivityListInput {
  tenantId: string;
  userId: string;
  entityType: EntityType;
  entityId: string;
  limit: number;
}

/** Servis çıktı şekli. */
export interface ActivityListResult {
  data: ActivityItem[];
  meta: { total: number; limit: number };
}

/**
 * Servis içinde kullanılan iç tip.
 * occurredAt Date olarak tutulur, dışarıya ISO string olarak çıkar.
 */
export interface InternalActivityItem
  extends Omit<ActivityItem, 'occurredAt' | 'sourceType' | 'businessSummary'> {
  occurredAt: Date;
}
