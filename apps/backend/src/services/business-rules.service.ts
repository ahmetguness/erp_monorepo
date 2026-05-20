import { Plan, type PrismaClient } from '@prisma/client';
import { ValidationError } from '../errors';
import { isPlanAtLeast } from '../types/plan.types';

export type BusinessRuleKey =
  | 'sales.quote_validity_days'
  | 'invoicing.invoice_due_days'
  | 'mail.default_signature'
  | 'payments.reminder_days_before_due'
  | 'approvals.default_limit'
  | 'service.default_sla_hours'
  | 'hr.required_employee_documents';

export type BusinessRuleType = 'number' | 'string' | 'string_list';
export type BusinessRuleValue = number | string | string[];

export interface BusinessRuleDefinition {
  key: BusinessRuleKey;
  type: BusinessRuleType;
  defaultValue: BusinessRuleValue;
  minPlan: Plan;
  module: string;
  label: string;
  description: string;
  consumingModules: string[];
  validation: {
    min?: number;
    max?: number;
    maxLength?: number;
    maxItems?: number;
  };
}

export interface ResolvedBusinessRule extends BusinessRuleDefinition {
  value: BusinessRuleValue;
  valueString: string;
  isDefault: boolean;
  isAvailable: boolean;
  tenantPlan: Plan;
}

const BUSINESS_RULE_DEFINITIONS: readonly BusinessRuleDefinition[] = [
  {
    key: 'sales.quote_validity_days',
    type: 'number',
    defaultValue: 30,
    minPlan: Plan.STARTER,
    module: 'sales',
    label: 'Teklif geçerlilik süresi',
    description: 'Yeni tekliflerde geçerlilik tarihini otomatik hesaplar.',
    consumingModules: ['sales_quotes', 'sales_quote_form'],
    validation: { min: 1, max: 365 },
  },
  {
    key: 'invoicing.invoice_due_days',
    type: 'number',
    defaultValue: 30,
    minPlan: Plan.STARTER,
    module: 'invoicing',
    label: 'Fatura varsayılan vade günü',
    description: 'Yeni faturalarda vade tarihini fatura tarihinden itibaren hesaplar.',
    consumingModules: ['invoice_create', 'invoice_form'],
    validation: { min: 0, max: 365 },
  },
  {
    key: 'mail.default_signature',
    type: 'string',
    defaultValue: '',
    minPlan: Plan.STARTER,
    module: 'mail',
    label: 'Mail varsayılan imzası',
    description: 'Serbest ve toplu mail gönderimlerinde içeriğin sonuna eklenir.',
    consumingModules: ['mail_send', 'bulk_mail_send'],
    validation: { maxLength: 2000 },
  },
  {
    key: 'payments.reminder_days_before_due',
    type: 'number',
    defaultValue: 7,
    minPlan: Plan.PROFESSIONAL,
    module: 'payments',
    label: 'Ödeme hatırlatma günü',
    description: 'Tahsilat vadesi yaklaşan fatura bildirimlerinin kaç gün önce görüneceğini belirler.',
    consumingModules: ['smart_notifications', 'payments'],
    validation: { min: 0, max: 60 },
  },
  {
    key: 'approvals.default_limit',
    type: 'number',
    defaultValue: 50000,
    minPlan: Plan.ENTERPRISE,
    module: 'approvals',
    label: 'Onay limiti',
    description: 'Onay akışları için varsayılan parasal limit bilgisidir.',
    consumingModules: ['approvals', 'workflow'],
    validation: { min: 0, max: 1_000_000_000 },
  },
  {
    key: 'service.default_sla_hours',
    type: 'number',
    defaultValue: 48,
    minPlan: Plan.ENTERPRISE,
    module: 'service',
    label: 'Servis SLA süresi',
    description: 'Açık servis taleplerinde SLA riski oluşmadan önceki varsayılan saat.',
    consumingModules: ['service_requests', 'smart_notifications'],
    validation: { min: 1, max: 720 },
  },
  {
    key: 'hr.required_employee_documents',
    type: 'string_list',
    defaultValue: ['Kimlik', 'SGK işe giriş'],
    minPlan: Plan.ENTERPRISE,
    module: 'hr',
    label: 'Zorunlu personel evrakları',
    description: 'Personel dosyasında takip edilecek varsayılan evrak listesi.',
    consumingModules: ['hr', 'document_center'],
    validation: { maxItems: 30, maxLength: 120 },
  },
] as const;

const BUSINESS_RULE_KEYS: ReadonlySet<string> = new Set(BUSINESS_RULE_DEFINITIONS.map((rule) => rule.key));

function isBusinessRuleKey(value: string): value is BusinessRuleKey {
  return BUSINESS_RULE_KEYS.has(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function valueToString(value: BusinessRuleValue): string {
  return Array.isArray(value) ? JSON.stringify(value) : String(value);
}

function parseStringList(value: unknown): string[] {
  if (isStringArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  if (typeof value !== 'string') return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isStringArray(parsed)) return parsed.map((item) => item.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
}

function normalizeValue(definition: BusinessRuleDefinition, input: unknown): BusinessRuleValue {
  if (definition.type === 'number') {
    const numericValue = typeof input === 'number' ? input : Number(String(input).trim());
    if (!Number.isFinite(numericValue)) {
      throw new ValidationError(`${definition.label} sayisal olmalidir.`);
    }

    const rounded = Math.round(numericValue);
    if (definition.validation.min !== undefined && rounded < definition.validation.min) {
      throw new ValidationError(`${definition.label} en az ${definition.validation.min} olmalidir.`);
    }
    if (definition.validation.max !== undefined && rounded > definition.validation.max) {
      throw new ValidationError(`${definition.label} en fazla ${definition.validation.max} olabilir.`);
    }
    return rounded;
  }

  if (definition.type === 'string_list') {
    const items = parseStringList(input);
    if (definition.validation.maxItems !== undefined && items.length > definition.validation.maxItems) {
      throw new ValidationError(`${definition.label} en fazla ${definition.validation.maxItems} kalem icerebilir.`);
    }
    const maxLength = definition.validation.maxLength;
    if (maxLength !== undefined && items.some((item) => item.length > maxLength)) {
      throw new ValidationError(`${definition.label} icindeki her kalem en fazla ${maxLength} karakter olabilir.`);
    }
    return items;
  }

  const text = typeof input === 'string' ? input : String(input ?? '');
  if (definition.validation.maxLength !== undefined && text.length > definition.validation.maxLength) {
    throw new ValidationError(`${definition.label} en fazla ${definition.validation.maxLength} karakter olabilir.`);
  }
  return text;
}

function parseStoredValue(definition: BusinessRuleDefinition, storedValue: string | undefined): BusinessRuleValue {
  if (storedValue === undefined) return definition.defaultValue;
  try {
    return normalizeValue(definition, storedValue);
  } catch {
    return definition.defaultValue;
  }
}

function parseStoredNumber(definition: BusinessRuleDefinition, storedValue: string | undefined): number {
  const value = parseStoredValue(definition, storedValue);
  if (typeof value !== 'number') {
    throw new ValidationError('Is kurali sayisal deger uretmedi.');
  }
  return value;
}

function parseStoredString(definition: BusinessRuleDefinition, storedValue: string | undefined): string {
  const value = parseStoredValue(definition, storedValue);
  if (typeof value !== 'string') {
    throw new ValidationError('Is kurali metin degeri uretmedi.');
  }
  return value;
}

function parseStoredStringArray(definition: BusinessRuleDefinition, storedValue: string | undefined): string[] {
  const value = parseStoredValue(definition, storedValue);
  if (!isStringArray(value)) {
    throw new ValidationError('Is kurali liste degeri uretmedi.');
  }
  return value;
}

export class BusinessRulesService {
  constructor(private readonly db: PrismaClient) {}

  get definitions(): readonly BusinessRuleDefinition[] {
    return BUSINESS_RULE_DEFINITIONS;
  }

  async list(tenantId: string): Promise<ResolvedBusinessRule[]> {
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });
    const tenantPlan = tenant?.plan ?? Plan.STARTER;
    const settings = await this.db.tenantSetting.findMany({
      where: { tenantId, key: { in: BUSINESS_RULE_DEFINITIONS.map((rule) => rule.key) } },
      select: { key: true, value: true },
    });
    const valueByKey = new Map(settings.map((setting) => [setting.key, setting.value]));

    return BUSINESS_RULE_DEFINITIONS.map((definition) => {
      const storedValue = valueByKey.get(definition.key);
      const value = parseStoredValue(definition, storedValue);
      return {
        ...definition,
        value,
        valueString: valueToString(value),
        isDefault: storedValue === undefined,
        isAvailable: isPlanAtLeast(tenantPlan, definition.minPlan),
        tenantPlan,
      };
    });
  }

  async upsert(tenantId: string, key: string, value: unknown): Promise<ResolvedBusinessRule> {
    if (!isBusinessRuleKey(key)) {
      throw new ValidationError('Gecersiz is kurali anahtari.');
    }

    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });
    const tenantPlan = tenant?.plan ?? Plan.STARTER;
    const definition = BUSINESS_RULE_DEFINITIONS.find((rule) => rule.key === key);
    if (!definition) {
      throw new ValidationError('Gecersiz is kurali anahtari.');
    }
    if (!isPlanAtLeast(tenantPlan, definition.minPlan)) {
      throw new ValidationError(`${definition.label} icin en az ${definition.minPlan} paketi gerekir.`);
    }

    const normalizedValue = normalizeValue(definition, value);
    const valueString = valueToString(normalizedValue);

    await this.db.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key, value: valueString },
      update: { value: valueString },
    });

    return {
      ...definition,
      value: normalizedValue,
      valueString,
      isDefault: false,
      isAvailable: true,
      tenantPlan,
    };
  }

  async getNumber(tenantId: string, key: Extract<BusinessRuleKey, 'sales.quote_validity_days' | 'invoicing.invoice_due_days' | 'payments.reminder_days_before_due' | 'approvals.default_limit' | 'service.default_sla_hours'>): Promise<number> {
    const definition = BUSINESS_RULE_DEFINITIONS.find((rule) => rule.key === key);
    if (!definition || definition.type !== 'number') {
      throw new ValidationError('Gecersiz sayisal is kurali anahtari.');
    }

    const setting = await this.db.tenantSetting.findUnique({
      where: { tenantId_key: { tenantId, key } },
      select: { value: true },
    });
    return parseStoredNumber(definition, setting?.value);
  }

  async getString(tenantId: string, key: Extract<BusinessRuleKey, 'mail.default_signature'>): Promise<string> {
    const definition = BUSINESS_RULE_DEFINITIONS.find((rule) => rule.key === key);
    if (!definition || definition.type !== 'string') {
      throw new ValidationError('Gecersiz metin is kurali anahtari.');
    }

    const setting = await this.db.tenantSetting.findUnique({
      where: { tenantId_key: { tenantId, key } },
      select: { value: true },
    });
    return parseStoredString(definition, setting?.value);
  }

  async getStringList(tenantId: string, key: Extract<BusinessRuleKey, 'hr.required_employee_documents'>): Promise<string[]> {
    const definition = BUSINESS_RULE_DEFINITIONS.find((rule) => rule.key === key);
    if (!definition || definition.type !== 'string_list') {
      throw new ValidationError('Gecersiz liste is kurali anahtari.');
    }

    const setting = await this.db.tenantSetting.findUnique({
      where: { tenantId_key: { tenantId, key } },
      select: { value: true },
    });
    return parseStoredStringArray(definition, setting?.value);
  }
}
