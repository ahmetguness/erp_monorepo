import { AuditAction, EntityType, Prisma } from '@prisma/client';

export const CRITICAL_AUDIT_ACTIONS: readonly AuditAction[] = [
  AuditAction.DELETE,
  AuditAction.APPROVE,
  AuditAction.REJECT,
  AuditAction.EXPORT,
];

const FINANCIAL_MODULES = new Set(['accounting', 'invoicing', 'payments', 'banking', 'payroll']);

interface AuditStandardInput {
  action: AuditAction;
  module: string;
  entityType: EntityType;
  oldValues: Prisma.JsonValue | null;
  newValues: Prisma.JsonValue | null;
}

export interface AuditStandardFlags {
  isCritical: boolean;
  criticalReason: string | null;
}

function isJsonObject(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumberField(value: Prisma.JsonValue | null, key: string): number | null {
  if (!isJsonObject(value)) return null;
  const field = value[key];
  return typeof field === 'number' ? field : null;
}

function readBooleanField(value: Prisma.JsonValue | null, key: string): boolean {
  if (!isJsonObject(value)) return false;
  return value[key] === true;
}

function readStringField(value: Prisma.JsonValue | null, key: string): string | null {
  if (!isJsonObject(value)) return null;
  const field = value[key];
  return typeof field === 'string' ? field : null;
}

export function resolveAuditStandardFlags(input: AuditStandardInput): AuditStandardFlags {
  if (CRITICAL_AUDIT_ACTIONS.includes(input.action)) {
    return { isCritical: true, criticalReason: `${input.action} aksiyonu kritik olay olarak izlenir.` };
  }

  const status = readNumberField(input.newValues, 'status');
  if (status !== null && status >= 400) {
    return { isCritical: true, criticalReason: `Basarisiz istek status ${status} ile kaydedildi.` };
  }

  if (readBooleanField(input.newValues, 'denied') || readBooleanField(input.newValues, 'rateLimited')) {
    return { isCritical: true, criticalReason: 'Erisim reddi veya rate limit olayi kaydedildi.' };
  }

  const oldStatus = readStringField(input.oldValues, 'status');
  const newStatus = readStringField(input.newValues, 'status');
  if (input.action === AuditAction.UPDATE && oldStatus !== newStatus && newStatus && ['CANCELLED', 'REJECTED', 'VOID'].includes(newStatus)) {
    return { isCritical: true, criticalReason: `Kayit durumu ${newStatus} olarak degisti.` };
  }

  if (FINANCIAL_MODULES.has(input.module) && input.action === AuditAction.UPDATE) {
    return { isCritical: true, criticalReason: 'Finansal modulde kritik guncelleme.' };
  }

  if (input.entityType === EntityType.INVOICE && input.action !== AuditAction.CREATE) {
    return { isCritical: true, criticalReason: 'Fatura kaydinda hassas islem.' };
  }

  return { isCritical: false, criticalReason: null };
}
