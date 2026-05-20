import { AuditAction, EntityType, Prisma } from '@prisma/client';

export interface AuditChange {
  field: string;
  label: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface BusinessAuditSummary {
  actionLabel: string;
  moduleLabel: string;
  entityTypeLabel: string;
  summary: string;
  changes: AuditChange[];
}

interface AuditFormatInput {
  action: AuditAction;
  module: string;
  entityType: EntityType;
  entityLabel: string | null;
  userLabel: string | null;
  oldValues: Prisma.JsonValue | null;
  newValues: Prisma.JsonValue | null;
}

const MODULE_LABELS: Record<string, string> = {
  accounting: 'Muhasebe',
  api_keys: 'API Anahtarı',
  approvals: 'Onay',
  attachments: 'Dosya',
  automation_rules: 'Otomasyon Kuralı',
  bank_accounts: 'Banka Hesabı',
  bank_transactions: 'Banka Hareketi',
  cash_accounts: 'Kasa',
  categories: 'Kategori',
  contacts: 'Cari',
  data_exchange: 'İçe / Dışa Aktarım',
  delivery_notes: 'İrsaliye',
  documents: 'Doküman',
  e_documents: 'E-Belge',
  hr: 'İnsan Kaynakları',
  inventory: 'Stok',
  invoicing: 'Fatura',
  mail: 'Mail',
  marketplace: 'Pazaryeri',
  payments: 'Ödeme',
  production: 'Üretim',
  products: 'Ürün',
  purchasing: 'Satın Alma',
  reporting: 'Rapor',
  roles: 'Rol Yönetimi',
  sales: 'Satış',
  service: 'Servis',
  settings: 'Ayar',
  stock: 'Stok',
  stock_movements: 'Stok Hareketi',
  tasks: 'Görev',
  users: 'Kullanıcı',
  workflow: 'İş Akışı',
};

const ENTITY_LABELS: Record<EntityType, string> = {
  INVOICE: 'Fatura',
  PRODUCT: 'Ürün',
  CATEGORY: 'Kategori',
  CONTACT: 'Cari',
  EMPLOYEE: 'Personel',
  CUSTOMER_ASSET: 'Müşteri Varlığı',
  SERVICE_REQUEST: 'Servis Talebi',
  PURCHASE_ORDER: 'Satın Alma Siparişi',
  SALES_QUOTE: 'Teklif',
  SALES_ORDER: 'Satış Siparişi',
  WORK_ORDER: 'İş Emri',
  DELIVERY_NOTE: 'İrsaliye',
  OTHER: 'Kayıt',
};

const ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: 'Oluşturma',
  UPDATE: 'Güncelleme',
  DELETE: 'Silme',
  APPROVE: 'Onay',
  REJECT: 'Red',
  EXPORT: 'Dışa Aktarma',
  LOGIN: 'Giriş',
  LOGOUT: 'Çıkış',
  OTHER: 'Diğer',
};

const ACTION_VERBS: Record<AuditAction, string> = {
  CREATE: 'oluşturdu',
  UPDATE: 'güncelledi',
  DELETE: 'sildi',
  APPROVE: 'onayladı',
  REJECT: 'reddetti',
  EXPORT: 'dışa aktardı',
  LOGIN: 'giriş yaptı',
  LOGOUT: 'çıkış yaptı',
  OTHER: 'işlem yaptı',
};

const FIELD_LABELS: Record<string, string> = {
  amount: 'Tutar',
  averageCost: 'Ortalama maliyet',
  barcode: 'Barkod',
  categoryId: 'Kategori',
  code: 'Kod',
  contactId: 'Cari',
  date: 'Tarih',
  description: 'Açıklama',
  discount: 'İskonto',
  dueDate: 'Vade tarihi',
  email: 'E-posta',
  fileName: 'Dosya adı',
  isActive: 'Aktiflik',
  method: 'Yöntem',
  minStockLevel: 'Kritik stok eşiği',
  name: 'Ad',
  notes: 'Not',
  number: 'Numara',
  paymentDate: 'Ödeme tarihi',
  priority: 'Öncelik',
  purchasePrice: 'Alış fiyatı',
  quantity: 'Miktar',
  reference: 'Referans',
  salesPrice: 'Satış fiyatı',
  status: 'Durum',
  subject: 'Konu',
  title: 'Başlık',
  totalGross: 'Genel toplam',
  totalNet: 'Ara toplam',
  totalTax: 'Vergi',
  type: 'Tip',
  unitPrice: 'Birim fiyat',
  validUntil: 'Geçerlilik tarihi',
};

const STATUS_LABELS: Record<string, string> = {
  ACCEPTED: 'Kabul edildi',
  APPROVED: 'Onaylandı',
  CANCELLED: 'İptal',
  COMPLETED: 'Tamamlandı',
  CRITICAL: 'Kritik',
  DRAFT: 'Taslak',
  EXPIRED: 'Süresi doldu',
  FAILED: 'Başarısız',
  HIGH: 'Yüksek',
  IN_PROGRESS: 'Devam ediyor',
  LOW: 'Düşük',
  MEDIUM: 'Orta',
  OPEN: 'Açık',
  OVERDUE: 'Gecikmiş',
  PAID: 'Ödendi',
  PARTIALLY_PAID: 'Kısmi ödeme',
  PENDING: 'Bekliyor',
  REJECTED: 'Reddedildi',
  SENT: 'Gönderildi',
  WAITING_CUSTOMER: 'Müşteri bekliyor',
  WAITING_PARTS: 'Parça bekliyor',
};

const HIDDEN_FIELDS = new Set(['id', 'tenantId', 'createdAt', 'updatedAt', 'deletedAt', 'passwordHash', 'keyHash']);
const IMPORTANT_FIELDS = ['status', 'amount', 'totalGross', 'minStockLevel', 'salesPrice', 'purchasePrice', 'dueDate', 'validUntil', 'name', 'number', 'email', 'priority'];

function isRecord(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function labelFromKey(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/Id$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (letter) => letter.toLocaleUpperCase('tr-TR'));
}

function isMoneyField(field: string): boolean {
  const lower = field.toLowerCase();
  return lower.includes('price') || lower.includes('amount') || lower.includes('total') || lower.includes('cost');
}

function isDateField(field: string): boolean {
  const lower = field.toLowerCase();
  return lower.includes('date') || lower.includes('until') || lower.endsWith('at');
}

function formatDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(value);
}

function formatJsonValue(field: string, value: Prisma.JsonValue | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  if (typeof value === 'number') return isMoneyField(field) ? formatMoney(value) : new Intl.NumberFormat('tr-TR').format(value);
  if (typeof value === 'string') {
    if (STATUS_LABELS[value]) return STATUS_LABELS[value];
    if (isMoneyField(field)) {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) return formatMoney(numeric);
    }
    if (isDateField(field)) return formatDate(value) ?? value;
    if (field.endsWith('Id')) return value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
    return value;
  }
  if (Array.isArray(value)) return `${value.length} öğe`;
  return 'detay';
}

function valuesEqual(left: Prisma.JsonValue | undefined, right: Prisma.JsonValue | undefined): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function sortFields(fields: string[]): string[] {
  return fields.sort((left, right) => {
    const leftIndex = IMPORTANT_FIELDS.indexOf(left);
    const rightIndex = IMPORTANT_FIELDS.indexOf(right);
    if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
    if (leftIndex >= 0) return -1;
    if (rightIndex >= 0) return 1;
    return left.localeCompare(right, 'tr');
  });
}

function buildChanges(action: AuditAction, oldValues: Prisma.JsonValue | null, newValues: Prisma.JsonValue | null): AuditChange[] {
  const oldRecord = isRecord(oldValues) ? oldValues : {};
  const newRecord = isRecord(newValues) ? newValues : {};
  const fields = sortFields(Array.from(new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)])))
    .filter((field) => !HIDDEN_FIELDS.has(field))
    .filter((field) => action !== AuditAction.UPDATE || !valuesEqual(oldRecord[field], newRecord[field]))
    .slice(0, 8);

  return fields.map((field) => ({
    field,
    label: labelFromKey(field),
    oldValue: formatJsonValue(field, oldRecord[field]),
    newValue: formatJsonValue(field, newRecord[field]),
  }));
}

function fallbackEntityLabel(entityType: EntityType, entityLabel: string | null): string {
  return entityLabel ?? ENTITY_LABELS[entityType];
}

function firstImpactChange(changes: AuditChange[]): AuditChange | null {
  return changes.find((change) => IMPORTANT_FIELDS.includes(change.field)) ?? changes[0] ?? null;
}

function buildSummary(input: AuditFormatInput, changes: AuditChange[]): string {
  const actor = input.userLabel ?? (input.module === 'api_keys' ? 'API anahtarı' : 'Sistem');
  const entity = fallbackEntityLabel(input.entityType, input.entityLabel);

  if (input.action === AuditAction.LOGIN || input.action === AuditAction.LOGOUT) {
    return `${actor} ${ACTION_VERBS[input.action]}.`;
  }

  const impact = firstImpactChange(changes);
  if (input.action === AuditAction.UPDATE && impact && impact.oldValue !== null && impact.newValue !== null) {
    return `${actor} ${entity} kaydında ${impact.label.toLocaleLowerCase('tr-TR')} alanını ${impact.oldValue} değerinden ${impact.newValue} değerine değiştirdi.`;
  }

  if (input.action === AuditAction.CREATE && impact?.newValue) {
    return `${actor} ${entity} kaydını oluşturdu (${impact.label}: ${impact.newValue}).`;
  }

  if (input.action === AuditAction.DELETE) {
    return `${actor} ${entity} kaydını sildi.`;
  }

  return `${actor} ${entity} üzerinde ${ACTION_VERBS[input.action]}.`;
}

export function getModuleLabel(module: string): string {
  return MODULE_LABELS[module] ?? labelFromKey(module);
}

export function getEntityTypeLabel(entityType: EntityType): string {
  return ENTITY_LABELS[entityType];
}

export function formatAuditLogBusiness(input: AuditFormatInput): BusinessAuditSummary {
  const changes = buildChanges(input.action, input.oldValues, input.newValues);
  return {
    actionLabel: ACTION_LABELS[input.action],
    moduleLabel: getModuleLabel(input.module),
    entityTypeLabel: getEntityTypeLabel(input.entityType),
    summary: buildSummary(input, changes),
    changes,
  };
}
