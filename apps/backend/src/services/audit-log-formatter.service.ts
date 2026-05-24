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

export type AuditFieldValueLabels = ReadonlyMap<string, ReadonlyMap<string, string>>;

interface AuditFormatInput {
  action: AuditAction;
  module: string;
  entityType: EntityType;
  entityLabel: string | null;
  userLabel: string | null;
  oldValues: Prisma.JsonValue | null;
  newValues: Prisma.JsonValue | null;
  fieldValueLabels?: AuditFieldValueLabels;
}

type AuditFieldKind = 'boolean' | 'date' | 'money' | 'quantity' | 'reference' | 'status' | 'text';

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
  createdById: 'Oluşturan kullanıcı',
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
  productId: 'Ürün',
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
  updatedById: 'Güncelleyen kullanıcı',
  userId: 'Kullanıcı',
  validUntil: 'Geçerlilik tarihi',
};

const FIELD_KINDS: Record<string, AuditFieldKind> = {
  amount: 'money',
  averageCost: 'money',
  categoryId: 'reference',
  contactId: 'reference',
  createdById: 'reference',
  date: 'date',
  discount: 'quantity',
  dueDate: 'date',
  isActive: 'boolean',
  method: 'status',
  minStockLevel: 'quantity',
  paymentDate: 'date',
  priority: 'status',
  productId: 'reference',
  purchasePrice: 'money',
  quantity: 'quantity',
  salesPrice: 'money',
  status: 'status',
  totalGross: 'money',
  totalNet: 'money',
  totalTax: 'money',
  type: 'status',
  unitPrice: 'money',
  updatedById: 'reference',
  userId: 'reference',
  validUntil: 'date',
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
  const leafKey = key.split('.').at(-1) ?? key;
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  if (FIELD_LABELS[leafKey]) return FIELD_LABELS[leafKey];
  return leafKey
    .replace(/Id$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (letter) => letter.toLocaleUpperCase('tr-TR'));
}

function isMoneyField(field: string): boolean {
  const leafKey = field.split('.').at(-1) ?? field;
  if (FIELD_KINDS[field] === 'money' || FIELD_KINDS[leafKey] === 'money') return true;
  const lower = field.toLowerCase();
  return lower.includes('price') || lower.includes('amount') || lower.includes('total') || lower.includes('cost');
}

function isDateField(field: string): boolean {
  const leafKey = field.split('.').at(-1) ?? field;
  if (FIELD_KINDS[field] === 'date' || FIELD_KINDS[leafKey] === 'date') return true;
  const lower = field.toLowerCase();
  return lower.includes('date') || lower.includes('until') || lower.endsWith('at');
}

function isQuantityField(field: string): boolean {
  const leafKey = field.split('.').at(-1) ?? field;
  if (FIELD_KINDS[field] === 'quantity' || FIELD_KINDS[leafKey] === 'quantity') return true;
  const lower = field.toLowerCase();
  return lower.includes('quantity') || lower.includes('stock') || lower.includes('count');
}

function isReferenceField(field: string): boolean {
  const leafKey = field.split('.').at(-1) ?? field;
  return FIELD_KINDS[field] === 'reference' || FIELD_KINDS[leafKey] === 'reference' || leafKey.endsWith('Id');
}

function isStatusField(field: string): boolean {
  const leafKey = field.split('.').at(-1) ?? field;
  return FIELD_KINDS[field] === 'status' || FIELD_KINDS[leafKey] === 'status';
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
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(value);
}

function formatJsonValue(field: string, value: Prisma.JsonValue | undefined, labels: AuditFieldValueLabels | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  if (typeof value === 'number') {
    if (isMoneyField(field)) return formatMoney(value);
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: isQuantityField(field) ? 3 : 2 }).format(value);
  }
  if (typeof value === 'string') {
    if (isReferenceField(field)) return referenceLabel(field, value, labels) ?? (value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value);
    if (isStatusField(field) && STATUS_LABELS[value]) return STATUS_LABELS[value];
    if (isMoneyField(field)) {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) return formatMoney(numeric);
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

function valuesEqual(left: Prisma.JsonValue | undefined, right: Prisma.JsonValue | undefined): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
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

function flattenRecord(record: Prisma.JsonObject, prefix = ''): Record<string, Prisma.JsonValue> {
  const flattened: Record<string, Prisma.JsonValue> = {};
  Object.entries(record).forEach(([key, value]) => {
    if (value === undefined) return;
    const field = prefix ? `${prefix}.${key}` : key;
    if (isRecord(value)) {
      Object.assign(flattened, flattenRecord(value, field));
      return;
    }
    flattened[field] = value;
  });
  return flattened;
}

function isVisibleField(field: string): boolean {
  const leafKey = field.split('.').at(-1) ?? field;
  return !HIDDEN_FIELDS.has(field) && !HIDDEN_FIELDS.has(leafKey);
}

function buildChanges(action: AuditAction, oldValues: Prisma.JsonValue | null, newValues: Prisma.JsonValue | null, labels: AuditFieldValueLabels | undefined): AuditChange[] {
  const oldRecord = isRecord(oldValues) ? flattenRecord(oldValues) : {};
  const newRecord = isRecord(newValues) ? flattenRecord(newValues) : {};
  const fields = sortFields(Array.from(new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)])))
    .filter(isVisibleField)
    .filter((field) => action !== AuditAction.UPDATE || !valuesEqual(oldRecord[field], newRecord[field]))
    .slice(0, 8);

  return fields.map((field) => ({
    field,
    label: labelFromKey(field),
    oldValue: formatJsonValue(field, oldRecord[field], labels),
    newValue: formatJsonValue(field, newRecord[field], labels),
  }));
}

function fallbackEntityLabel(entityType: EntityType, entityLabel: string | null): string {
  return entityLabel ?? ENTITY_LABELS[entityType];
}

function firstImpactChange(changes: AuditChange[]): AuditChange | null {
  return changes.find((change) => IMPORTANT_FIELDS.includes(change.field.split('.').at(-1) ?? change.field)) ?? changes[0] ?? null;
}

function possessiveEntity(entityType: EntityType, entity: string): string {
  if (entityType === EntityType.INVOICE) return `${entity} faturasının`;
  if (entityType === EntityType.PRODUCT) return `${entity} ürününün`;
  if (entityType === EntityType.CONTACT) return `${entity} carisinin`;
  if (entityType === EntityType.SALES_QUOTE) return `${entity} teklifinin`;
  if (entityType === EntityType.SALES_ORDER) return `${entity} satış siparişinin`;
  if (entityType === EntityType.PURCHASE_ORDER) return `${entity} satın alma siparişinin`;
  return `${entity} kaydının`;
}

function impactVerb(field: string): string {
  const leafKey = field.split('.').at(-1) ?? field;
  if (leafKey === 'dueDate') return 'vadesini';
  if (leafKey === 'validUntil') return 'geçerlilik tarihini';
  if (leafKey === 'status') return 'durumunu';
  if (leafKey === 'totalGross') return 'genel toplamını';
  if (leafKey === 'contactId') return 'carisini';
  if (leafKey === 'productId') return 'ürününü';
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
    return `${actor} ${possessiveEntity(input.entityType, entity)} ${impactVerb(impact.field)} ${impact.oldValue} değerinden ${impact.newValue} değerine değiştirdi.`;
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
  const changes = buildChanges(input.action, input.oldValues, input.newValues, input.fieldValueLabels);
  return {
    actionLabel: ACTION_LABELS[input.action],
    moduleLabel: getModuleLabel(input.module),
    entityTypeLabel: getEntityTypeLabel(input.entityType),
    summary: buildSummary(input, changes),
    changes,
  };
}
