import { type PrismaClient } from '@prisma/client';

type DefaultPolicyDbClient = PrismaClient;
export type DefaultPolicyScope = 'tenant' | 'contact' | 'product' | 'automation';
export type DefaultPolicyValueType = 'string' | 'boolean' | 'number';
export type DefaultPolicySettingKey =
  | 'defaultCurrency'
  | 'defaultWarehouse'
  | 'defaultBankAccount'
  | 'defaultCashAccount'
  | 'defaultTaxRate'
  | 'defaultPaymentTerm'
  | 'defaultPriceList'
  | 'defaultSalesRep'
  | 'defaultDeliveryMethod'
  | 'defaultLocation'
  | 'preferredSupplier'
  | 'costingMethod'
  | 'autoInvoice'
  | 'autoReserve'
  | 'autoPurchaseRequest'
  | 'autoBankReconcile'
  | 'autoAccountingPost'
  | 'autoSendReminder'
  | 'autoSendCollectionEmail'
  | 'collectionEscalationDays';

export interface DefaultPolicyDefinition {
  scope: DefaultPolicyScope;
  key: DefaultPolicySettingKey;
  storageKey: string;
  label: string;
  description: string;
  valueType: DefaultPolicyValueType;
  defaultValue: string;
}

export interface DefaultPolicyValue extends DefaultPolicyDefinition {
  value: string;
  effectiveValue: string;
  isDefault: boolean;
  updatedAt: string | null;
}

export interface DefaultPolicySnapshot {
  generatedAt: string;
  values: DefaultPolicyValue[];
}

export interface DefaultPolicyUpdateInput {
  storageKey: string;
  value: string;
}

const DEFINITIONS: readonly DefaultPolicyDefinition[] = [
  { scope: 'tenant', key: 'defaultCurrency', storageKey: 'defaults.tenant.defaultCurrency', label: 'Default currency', description: 'Yeni kayitlarda para birimi onerisi.', valueType: 'string', defaultValue: 'TRY' },
  { scope: 'tenant', key: 'defaultWarehouse', storageKey: 'defaults.tenant.defaultWarehouse', label: 'Default warehouse', description: 'Stok ve satis akislari icin varsayilan depo.', valueType: 'string', defaultValue: '' },
  { scope: 'tenant', key: 'defaultBankAccount', storageKey: 'defaults.tenant.defaultBankAccount', label: 'Default bank account', description: 'Banka tahsilat/odeme akislari icin varsayilan hesap.', valueType: 'string', defaultValue: '' },
  { scope: 'tenant', key: 'defaultCashAccount', storageKey: 'defaults.tenant.defaultCashAccount', label: 'Default cash account', description: 'Nakit islemler icin varsayilan kasa.', valueType: 'string', defaultValue: '' },
  { scope: 'tenant', key: 'defaultTaxRate', storageKey: 'defaults.tenant.defaultTaxRate', label: 'Default tax rate', description: 'Satir girislerinde onerilen KDV orani.', valueType: 'number', defaultValue: '20' },
  { scope: 'tenant', key: 'defaultPaymentTerm', storageKey: 'defaults.tenant.defaultPaymentTerm', label: 'Default payment term', description: 'Fatura vadesi icin varsayilan gun.', valueType: 'number', defaultValue: '30' },
  { scope: 'contact', key: 'defaultPaymentTerm', storageKey: 'defaults.contact.defaultPaymentTerm', label: 'Contact payment term', description: 'Cari bazli vade onceligi.', valueType: 'number', defaultValue: '30' },
  { scope: 'contact', key: 'defaultCurrency', storageKey: 'defaults.contact.defaultCurrency', label: 'Contact currency', description: 'Cari bazli para birimi onceligi.', valueType: 'string', defaultValue: '' },
  { scope: 'contact', key: 'defaultPriceList', storageKey: 'defaults.contact.defaultPriceList', label: 'Contact price list', description: 'Cari icin varsayilan fiyat listesi anahtari.', valueType: 'string', defaultValue: '' },
  { scope: 'contact', key: 'defaultSalesRep', storageKey: 'defaults.contact.defaultSalesRep', label: 'Contact sales rep', description: 'Cari icin varsayilan satis temsilcisi.', valueType: 'string', defaultValue: '' },
  { scope: 'contact', key: 'defaultWarehouse', storageKey: 'defaults.contact.defaultWarehouse', label: 'Contact warehouse', description: 'Cari siparislerinde depo onceligi.', valueType: 'string', defaultValue: '' },
  { scope: 'contact', key: 'defaultDeliveryMethod', storageKey: 'defaults.contact.defaultDeliveryMethod', label: 'Contact delivery method', description: 'Teslimat yontemi onceligi.', valueType: 'string', defaultValue: '' },
  { scope: 'product', key: 'defaultWarehouse', storageKey: 'defaults.product.defaultWarehouse', label: 'Product warehouse', description: 'Urun icin depo onceligi.', valueType: 'string', defaultValue: '' },
  { scope: 'product', key: 'defaultLocation', storageKey: 'defaults.product.defaultLocation', label: 'Product location', description: 'Depo ici varsayilan lokasyon.', valueType: 'string', defaultValue: '' },
  { scope: 'product', key: 'preferredSupplier', storageKey: 'defaults.product.preferredSupplier', label: 'Preferred supplier', description: 'Satinalma onerileri icin tedarikci onceligi.', valueType: 'string', defaultValue: '' },
  { scope: 'product', key: 'defaultTaxRate', storageKey: 'defaults.product.defaultTaxRate', label: 'Product tax rate', description: 'Urun bazli vergi orani onceligi.', valueType: 'number', defaultValue: '20' },
  { scope: 'product', key: 'costingMethod', storageKey: 'defaults.product.costingMethod', label: 'Costing method', description: 'Stok degerleme icin maliyet yontemi.', valueType: 'string', defaultValue: 'MOVING_AVERAGE' },
  { scope: 'automation', key: 'autoInvoice', storageKey: 'policies.automation.autoInvoice', label: 'Auto invoice', description: 'Uygun siparislerden otomatik fatura olusturma politikasi.', valueType: 'boolean', defaultValue: 'false' },
  { scope: 'automation', key: 'autoReserve', storageKey: 'policies.automation.autoReserve', label: 'Auto reserve', description: 'Satis onayinda stok rezervasyonu politikasi.', valueType: 'boolean', defaultValue: 'true' },
  { scope: 'automation', key: 'autoPurchaseRequest', storageKey: 'policies.automation.autoPurchaseRequest', label: 'Auto purchase request', description: 'Dusuk stoktan satinalma talebi olusturma politikasi.', valueType: 'boolean', defaultValue: 'false' },
  { scope: 'automation', key: 'autoBankReconcile', storageKey: 'policies.automation.autoBankReconcile', label: 'Auto bank reconcile', description: 'Guvenli banka eslesmelerini otomatik isleme politikasi.', valueType: 'boolean', defaultValue: 'false' },
  { scope: 'automation', key: 'autoAccountingPost', storageKey: 'policies.automation.autoAccountingPost', label: 'Auto accounting post', description: 'Uygun belgeleri otomatik muhasebelestirme politikasi.', valueType: 'boolean', defaultValue: 'false' },
  { scope: 'automation', key: 'autoSendReminder', storageKey: 'policies.automation.autoSendReminder', label: 'Auto send reminder', description: 'Tahsilat hatirlatmalarini otomatik gonderme politikasi.', valueType: 'boolean', defaultValue: 'false' },
  { scope: 'automation', key: 'autoSendCollectionEmail', storageKey: 'policies.collection.autoSendCollectionEmail', label: 'Auto send collection email', description: 'Ilk surumde email yerine onaylanabilir taslak gorevi uretir.', valueType: 'boolean', defaultValue: 'false' },
  { scope: 'automation', key: 'collectionEscalationDays', storageKey: 'policies.collection.collectionEscalationDays', label: 'Collection escalation days', description: 'Gecikmis tahsilatlarda eskalasyon gorevi acma gunu.', valueType: 'number', defaultValue: '15' },
];

const DEFINITIONS_BY_KEY = new Map(DEFINITIONS.map((definition) => [definition.storageKey, definition]));

function normalizeValue(definition: DefaultPolicyDefinition, value: string): string {
  const trimmed = value.trim();
  if (definition.valueType === 'boolean') return trimmed === 'true' ? 'true' : 'false';
  if (definition.valueType === 'number') {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? String(parsed) : definition.defaultValue;
  }
  return trimmed;
}

export function defaultPolicyDefinitions(): readonly DefaultPolicyDefinition[] {
  return DEFINITIONS;
}

export class DefaultPolicyEngineService {
  constructor(private readonly db: DefaultPolicyDbClient) {}

  async snapshot(tenantId: string): Promise<DefaultPolicySnapshot> {
    const settings = await this.db.tenantSetting.findMany({
      where: { tenantId, key: { in: DEFINITIONS.map((definition) => definition.storageKey) } },
      orderBy: { key: 'asc' },
    });
    const byStorageKey = new Map(settings.map((setting) => [setting.key, setting]));
    const values = DEFINITIONS.map((definition): DefaultPolicyValue => {
      const setting = byStorageKey.get(definition.storageKey);
      const value = setting ? normalizeValue(definition, setting.value) : definition.defaultValue;
      return {
        ...definition,
        value: setting?.value ?? '',
        effectiveValue: value,
        isDefault: !setting,
        updatedAt: setting?.updatedAt.toISOString() ?? null,
      };
    });
    return { generatedAt: new Date().toISOString(), values };
  }

  async updateMany(tenantId: string, updates: readonly DefaultPolicyUpdateInput[]): Promise<DefaultPolicySnapshot> {
    const operations = updates.map((update) => {
      const definition = DEFINITIONS_BY_KEY.get(update.storageKey);
      if (!definition) return null;
      const value = normalizeValue(definition, update.value);
      return this.db.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key: definition.storageKey } },
        create: { tenantId, key: definition.storageKey, value },
        update: { value },
      });
    }).filter((operation): operation is NonNullable<typeof operation> => operation !== null);

    if (operations.length > 0) await this.db.$transaction(operations);
    return this.snapshot(tenantId);
  }

  async resolve(tenantId: string, storageKey: string): Promise<string | null> {
    const definition = DEFINITIONS_BY_KEY.get(storageKey);
    if (!definition) return null;
    const setting = await this.db.tenantSetting.findUnique({ where: { tenantId_key: { tenantId, key: storageKey } } });
    return setting ? normalizeValue(definition, setting.value) : definition.defaultValue;
  }
}
