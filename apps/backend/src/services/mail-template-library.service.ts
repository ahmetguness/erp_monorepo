export const MAIL_TEMPLATE_VARIABLE_KEYS = [
  'customerName',
  'invoiceNo',
  'dueDate',
  'amount',
  'employeeName',
  'quoteNo',
  'serviceNo',
] as const;

export type MailTemplateVariableKey = (typeof MAIL_TEMPLATE_VARIABLE_KEYS)[number];

export const MAIL_TEMPLATE_IDS = [
  'quote_followup',
  'payment_reminder',
  'employee_document',
  'service_update',
  'bulk_announcement',
] as const;

export type MailTemplateId = (typeof MAIL_TEMPLATE_IDS)[number];

export type MailDraftTone = 'formal' | 'friendly' | 'short';

export interface MailTemplateVariableDefinition {
  key: MailTemplateVariableKey;
  label: string;
  required: boolean;
  example: string;
}

export interface MailTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  subject: string;
  body: string;
  variables: MailTemplateVariableDefinition[];
}

export interface RenderedMailTemplate {
  templateId: string;
  subject: string;
  body: string;
  missingVariables: MailTemplateVariableKey[];
}

export type MailTemplateVariables = Partial<Record<MailTemplateVariableKey, string>>;

const VARIABLE_DEFINITIONS: Record<MailTemplateVariableKey, MailTemplateVariableDefinition> = {
  customerName: {
    key: 'customerName',
    label: 'Musteri adi',
    required: false,
    example: 'Acme Ltd.',
  },
  invoiceNo: {
    key: 'invoiceNo',
    label: 'Fatura no',
    required: false,
    example: 'FTR-2026-001',
  },
  dueDate: {
    key: 'dueDate',
    label: 'Vade tarihi',
    required: false,
    example: '31.05.2026',
  },
  amount: {
    key: 'amount',
    label: 'Tutar',
    required: false,
    example: '25.000 TL',
  },
  employeeName: {
    key: 'employeeName',
    label: 'Personel adi',
    required: false,
    example: 'Ayse Yilmaz',
  },
  quoteNo: {
    key: 'quoteNo',
    label: 'Teklif no',
    required: false,
    example: 'TKL-2026-014',
  },
  serviceNo: {
    key: 'serviceNo',
    label: 'Servis no',
    required: false,
    example: 'SRV-2026-008',
  },
};

const MAIL_TEMPLATES: readonly MailTemplate[] = [
  {
    id: 'quote_followup',
    name: 'Teklif takip',
    category: 'Satis',
    description: 'Acik teklifleri nazik ve aksiyonlu sekilde takip eder.',
    subject: '{{customerName}} - {{quoteNo}} teklif takibi',
    body:
      'Merhaba {{customerName}},\n\n{{quoteNo}} numarali teklifimizle ilgili goruslerinizi almak isteriz. Ek bilgiye ihtiyaciniz varsa memnuniyetle destek oluruz.\n\nUygunsa kisa bir geri donus rica ederiz.\n\nSaygilarimizla,',
    variables: [
      { ...VARIABLE_DEFINITIONS.customerName, required: true },
      { ...VARIABLE_DEFINITIONS.quoteNo, required: true },
    ],
  },
  {
    id: 'payment_reminder',
    name: 'Odeme hatirlatma',
    category: 'Muhasebe',
    description: 'Vadesi gelen veya gecen faturalar icin odeme hatirlatir.',
    subject: '{{invoiceNo}} numarali fatura odeme hatirlatmasi',
    body:
      'Merhaba {{customerName}},\n\n{{invoiceNo}} numarali, {{amount}} tutarindaki faturanin vade tarihi {{dueDate}} olarak gorunmektedir. Odeme planiniz hakkinda bilgi paylasmanizi rica ederiz.\n\nTesekkurler,',
    variables: [
      { ...VARIABLE_DEFINITIONS.customerName, required: true },
      { ...VARIABLE_DEFINITIONS.invoiceNo, required: true },
      { ...VARIABLE_DEFINITIONS.dueDate, required: true },
      { ...VARIABLE_DEFINITIONS.amount, required: true },
    ],
  },
  {
    id: 'employee_document',
    name: 'Personel evrak talebi',
    category: 'HR',
    description: 'Eksik personel evraklarini tamamlatmak icin kullanilir.',
    subject: '{{employeeName}} eksik evrak talebi',
    body:
      'Merhaba {{employeeName}},\n\nPersonel dosyanizdaki eksik evraklarin tamamlanmasi gerekiyor. Musait oldugunuzda ilgili belgeleri HR ekibiyle paylasmanizi rica ederiz.\n\nTesekkurler,',
    variables: [{ ...VARIABLE_DEFINITIONS.employeeName, required: true }],
  },
  {
    id: 'service_update',
    name: 'Servis bilgilendirme',
    category: 'Servis',
    description: 'Servis sureciyle ilgili musteri bilgilendirmesi yapar.',
    subject: '{{serviceNo}} servis sureci bilgilendirmesi',
    body:
      'Merhaba {{customerName}},\n\n{{serviceNo}} numarali servis kaydinizla ilgili surec devam etmektedir. Gelismeleri tamamlandikca sizinle paylasacagiz.\n\nSaygilarimizla,',
    variables: [
      { ...VARIABLE_DEFINITIONS.customerName, required: true },
      { ...VARIABLE_DEFINITIONS.serviceNo, required: true },
    ],
  },
  {
    id: 'bulk_announcement',
    name: 'Toplu duyuru',
    category: 'Genel',
    description: 'Toplu bilgilendirme ve duyuru mailleri icin sade temel metin.',
    subject: 'Bilgilendirme',
    body:
      'Merhaba,\n\nSizinle asagidaki bilgilendirmeyi paylasmak isteriz:\n\n[Mesajinizi buraya yazin]\n\nSaygilarimizla,',
    variables: [],
  },
] as const;

const MAIL_TEMPLATE_ID_SET: ReadonlySet<string> = new Set(MAIL_TEMPLATE_IDS);
const MAIL_TEMPLATE_VARIABLE_KEY_SET: ReadonlySet<string> = new Set(MAIL_TEMPLATE_VARIABLE_KEYS);

export function getMailTemplates(): readonly MailTemplate[] {
  return MAIL_TEMPLATES;
}

export function getMailTemplateById(templateId: MailTemplateId): MailTemplate | undefined {
  return MAIL_TEMPLATES.find((template) => template.id === templateId);
}

export function isMailTemplateId(value: string): value is MailTemplateId {
  return MAIL_TEMPLATE_ID_SET.has(value);
}

export function isMailTemplateVariableKey(value: string): value is MailTemplateVariableKey {
  return MAIL_TEMPLATE_VARIABLE_KEY_SET.has(value);
}

function replaceTemplateVariables(value: string, variables: MailTemplateVariables): string {
  return value.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, rawKey: string) => {
    if (!isMailTemplateVariableKey(rawKey)) return match;
    const replacement = variables[rawKey]?.trim();
    return replacement || match;
  });
}

export function renderMailTemplate(
  templateId: MailTemplateId,
  variables: MailTemplateVariables,
): RenderedMailTemplate | null {
  const template = getMailTemplateById(templateId);
  if (!template) return null;

  return {
    templateId,
    subject: replaceTemplateVariables(template.subject, variables),
    body: replaceTemplateVariables(template.body, variables),
    missingVariables: template.variables
      .filter((variable) => variable.required && !variables[variable.key]?.trim())
      .map((variable) => variable.key),
  };
}

export function createFallbackMailDraft(options: {
  templateId: MailTemplateId;
  variables: MailTemplateVariables;
  notes?: string;
}): RenderedMailTemplate | null {
  const rendered = renderMailTemplate(options.templateId, options.variables);
  if (!rendered) return null;
  const notes = options.notes?.trim();
  return {
    ...rendered,
    body: notes ? `${rendered.body}\n\nNot: ${notes}` : rendered.body,
  };
}
