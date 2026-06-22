import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import {
  getMailTemplates,
  isMailTemplateId,
  isMailTemplateVariableKey,
  MailTemplate,
  MailTemplateVariableDefinition,
  MailTemplateVariables,
} from './mail-template-library.service';

const TENANT_MAIL_TEMPLATES_KEY = 'mail.templates.custom';
const MAX_TEMPLATE_COUNT = 50;
const MAX_FIELD_LENGTH = {
  name: 120,
  category: 80,
  description: 300,
  subject: 200,
  body: 10000,
} as const;

export type ManagedMailTemplateScope = 'SYSTEM' | 'TENANT';

export interface ManagedMailTemplate extends MailTemplate {
  scope: ManagedMailTemplateScope;
  version: number;
  approved: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdById?: string;
  updatedById?: string;
}

export interface MailTemplateInput {
  name: string;
  category: string;
  description?: string;
  subject: string;
  body: string;
  variables: MailTemplateVariableDefinition[];
  approved?: boolean;
}

export interface TenantMailTemplateMutationOptions {
  tenantId: string;
  userId: string;
  templateId?: string;
  input: MailTemplateInput;
}

export interface RenderedManagedMailTemplate {
  templateId: string;
  subject: string;
  body: string;
  missingVariables: string[];
}

export interface MailTemplateLifecycleSummary {
  total: number;
  systemCount: number;
  tenantCount: number;
  approvedTenantCount: number;
  draftTenantCount: number;
  latestTenantVersion: number;
  variableSchemaCount: number;
  requiredVariableCount: number;
}

interface StoredTenantMailTemplate extends ManagedMailTemplate {
  scope: 'TENANT';
  createdAt: string;
  updatedAt: string;
  createdById: string;
  updatedById: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readPositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function truncate(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function isVariableDefinition(value: unknown): value is MailTemplateVariableDefinition {
  if (!isRecord(value)) return false;
  return (
    typeof value.key === 'string' &&
    isMailTemplateVariableKey(value.key) &&
    typeof value.label === 'string' &&
    typeof value.required === 'boolean' &&
    typeof value.example === 'string'
  );
}

function sanitizeVariableDefinition(value: MailTemplateVariableDefinition): MailTemplateVariableDefinition {
  return {
    key: value.key,
    label: truncate(value.label, 80),
    required: value.required,
    example: truncate(value.example, 120),
  };
}

function readStoredTemplate(value: unknown): StoredTenantMailTemplate | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id).trim();
  const name = readString(value.name).trim();
  const category = readString(value.category).trim();
  const subject = readString(value.subject).trim();
  const body = readString(value.body).trim();
  const createdAt = readString(value.createdAt).trim();
  const updatedAt = readString(value.updatedAt).trim();
  const createdById = readString(value.createdById).trim();
  const updatedById = readString(value.updatedById).trim();
  const rawVariables = Array.isArray(value.variables) ? value.variables : [];
  const variables = rawVariables
    .filter(isVariableDefinition)
    .map(sanitizeVariableDefinition);

  if (!id || !name || !category || !subject || !body || !createdAt || !updatedAt || !createdById || !updatedById) {
    return null;
  }

  return {
    id,
    name,
    category,
    description: readString(value.description),
    subject,
    body,
    variables,
    scope: 'TENANT',
    version: readPositiveInteger(value.version, 1),
    approved: value.approved === true,
    createdAt,
    updatedAt,
    createdById,
    updatedById,
  };
}

function parseStoredTemplates(value: string | null | undefined): StoredTenantMailTemplate[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(readStoredTemplate)
      .filter((template): template is StoredTenantMailTemplate => template !== null);
  } catch {
    return [];
  }
}

function toSystemTemplate(template: MailTemplate): ManagedMailTemplate {
  return {
    ...template,
    scope: 'SYSTEM',
    version: 1,
    approved: true,
  };
}

function sanitizeInput(input: MailTemplateInput): MailTemplateInput {
  return {
    name: truncate(input.name, MAX_FIELD_LENGTH.name),
    category: truncate(input.category, MAX_FIELD_LENGTH.category),
    description: truncate(input.description ?? '', MAX_FIELD_LENGTH.description),
    subject: truncate(input.subject, MAX_FIELD_LENGTH.subject),
    body: truncate(input.body, MAX_FIELD_LENGTH.body),
    variables: input.variables.map(sanitizeVariableDefinition),
    approved: input.approved === true,
  };
}

function validateTemplateInput(input: MailTemplateInput): string | null {
  if (!input.name.trim()) return 'Sablon adi zorunludur.';
  if (!input.category.trim()) return 'Sablon kategorisi zorunludur.';
  if (!input.subject.trim()) return 'Sablon konusu zorunludur.';
  if (!input.body.trim()) return 'Sablon metni zorunludur.';
  const duplicateKeys = new Set<string>();
  for (const variable of input.variables) {
    if (duplicateKeys.has(variable.key)) return 'Ayni degisken birden fazla eklenemez.';
    duplicateKeys.add(variable.key);
  }
  return null;
}

export function renderMailTemplateText(value: string, variables: MailTemplateVariables): string {
  return value.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, rawKey: string) => {
    if (!isMailTemplateVariableKey(rawKey)) return match;
    const replacement = variables[rawKey]?.trim();
    return replacement || match;
  });
}

async function readTenantTemplates(tenantId: string): Promise<StoredTenantMailTemplate[]> {
  const setting = await prisma.tenantSetting.findUnique({
    where: { tenantId_key: { tenantId, key: TENANT_MAIL_TEMPLATES_KEY } },
    select: { value: true },
  });
  return parseStoredTemplates(setting?.value);
}

async function saveTenantTemplates(tenantId: string, templates: readonly StoredTenantMailTemplate[]): Promise<void> {
  await prisma.tenantSetting.upsert({
    where: { tenantId_key: { tenantId, key: TENANT_MAIL_TEMPLATES_KEY } },
    create: {
      tenantId,
      key: TENANT_MAIL_TEMPLATES_KEY,
      value: JSON.stringify(templates),
    },
    update: {
      value: JSON.stringify(templates),
    },
  });
}

export class MailTemplateManagementService {
  static async list(tenantId: string): Promise<ManagedMailTemplate[]> {
    const tenantTemplates = await readTenantTemplates(tenantId);
    return [
      ...getMailTemplates().map(toSystemTemplate),
      ...tenantTemplates,
    ];
  }

  static async lifecycleSummary(tenantId: string): Promise<MailTemplateLifecycleSummary> {
    const templates = await this.list(tenantId);
    const tenantTemplates = templates.filter((template) => template.scope === 'TENANT');
    const variableSchemaCount = templates.reduce((count, template) => count + template.variables.length, 0);
    const requiredVariableCount = templates.reduce(
      (count, template) => count + template.variables.filter((variable) => variable.required).length,
      0,
    );

    return {
      total: templates.length,
      systemCount: templates.length - tenantTemplates.length,
      tenantCount: tenantTemplates.length,
      approvedTenantCount: tenantTemplates.filter((template) => template.approved).length,
      draftTenantCount: tenantTemplates.filter((template) => !template.approved).length,
      latestTenantVersion: tenantTemplates.reduce((latest, template) => Math.max(latest, template.version), 0),
      variableSchemaCount,
      requiredVariableCount,
    };
  }

  static async find(tenantId: string, templateId: string): Promise<ManagedMailTemplate | null> {
    if (isMailTemplateId(templateId)) {
      const systemTemplate = getMailTemplates().find((template) => template.id === templateId);
      return systemTemplate ? toSystemTemplate(systemTemplate) : null;
    }
    const tenantTemplates = await readTenantTemplates(tenantId);
    return tenantTemplates.find((template) => template.id === templateId) ?? null;
  }

  static async create(options: TenantMailTemplateMutationOptions): Promise<ManagedMailTemplate | { error: string }> {
    const input = sanitizeInput(options.input);
    const validationError = validateTemplateInput(input);
    if (validationError) return { error: validationError };

    const templates = await readTenantTemplates(options.tenantId);
    if (templates.length >= MAX_TEMPLATE_COUNT) return { error: `En fazla ${MAX_TEMPLATE_COUNT} ozel sablon olusturulabilir.` };

    const now = new Date().toISOString();
    const template: StoredTenantMailTemplate = {
      id: `tenant_${randomUUID()}`,
      ...input,
      description: input.description ?? '',
      scope: 'TENANT',
      version: 1,
      approved: input.approved === true,
      createdAt: now,
      updatedAt: now,
      createdById: options.userId,
      updatedById: options.userId,
    };

    await saveTenantTemplates(options.tenantId, [template, ...templates]);
    return template;
  }

  static async update(options: TenantMailTemplateMutationOptions): Promise<ManagedMailTemplate | { error: string }> {
    const templateId = options.templateId?.trim();
    if (!templateId || isMailTemplateId(templateId)) return { error: 'Sadece tenant ozel sablonlari duzenlenebilir.' };

    const input = sanitizeInput(options.input);
    const validationError = validateTemplateInput(input);
    if (validationError) return { error: validationError };

    const templates = await readTenantTemplates(options.tenantId);
    const existing = templates.find((template) => template.id === templateId);
    if (!existing) return { error: 'Sablon bulunamadi.' };

    const updated: StoredTenantMailTemplate = {
      ...existing,
      ...input,
      description: input.description ?? '',
      version: existing.version + 1,
      approved: input.approved === true,
      updatedAt: new Date().toISOString(),
      updatedById: options.userId,
    };

    await saveTenantTemplates(options.tenantId, templates.map((template) => (template.id === templateId ? updated : template)));
    return updated;
  }

  static async approve(tenantId: string, userId: string, templateId: string, approved: boolean): Promise<ManagedMailTemplate | null> {
    if (isMailTemplateId(templateId)) return null;
    const templates = await readTenantTemplates(tenantId);
    const existing = templates.find((template) => template.id === templateId);
    if (!existing) return null;

    const updated: StoredTenantMailTemplate = {
      ...existing,
      approved,
      updatedAt: new Date().toISOString(),
      updatedById: userId,
    };

    await saveTenantTemplates(tenantId, templates.map((template) => (template.id === templateId ? updated : template)));
    return updated;
  }

  static async delete(tenantId: string, templateId: string): Promise<boolean> {
    if (isMailTemplateId(templateId)) return false;
    const templates = await readTenantTemplates(tenantId);
    const next = templates.filter((template) => template.id !== templateId);
    if (next.length === templates.length) return false;
    await saveTenantTemplates(tenantId, next);
    return true;
  }

  static async render(
    tenantId: string,
    templateId: string,
    variables: MailTemplateVariables,
  ): Promise<RenderedManagedMailTemplate | null> {
    const template = await this.find(tenantId, templateId);
    if (!template) return null;

    return {
      templateId,
      subject: renderMailTemplateText(template.subject, variables),
      body: renderMailTemplateText(template.body, variables),
      missingVariables: template.variables
        .filter((variable) => variable.required && !variables[variable.key]?.trim())
        .map((variable) => variable.key),
    };
  }

  static async fallbackDraft(options: {
    tenantId: string;
    templateId: string;
    variables: MailTemplateVariables;
    notes?: string;
  }): Promise<RenderedManagedMailTemplate | null> {
    const rendered = await this.render(options.tenantId, options.templateId, options.variables);
    if (!rendered) return null;
    const notes = readOptionalString(options.notes);
    return {
      ...rendered,
      body: notes ? `${rendered.body}\n\nNot: ${notes}` : rendered.body,
    };
  }
}
