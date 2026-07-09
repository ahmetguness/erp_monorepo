import type { Prisma } from '@prisma/client';

export interface ApprovalFlowConditions {
  minAmount: number | null;
  maxAmount: number | null;
  departments: string[];
  documentTypes: string[];
}

export interface ApprovalRequestContext {
  amount: number | null;
  department: string | null;
  documentType: string | null;
}

export interface ApprovalConditionEvaluation {
  matches: boolean;
  reasons: string[];
  conditions: ApprovalFlowConditions;
  context: ApprovalRequestContext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readString(item))
    .filter((item): item is string => item !== null);
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function parseApprovalFlowConditions(value: unknown): ApprovalFlowConditions {
  if (!isRecord(value)) {
    return { minAmount: null, maxAmount: null, departments: [], documentTypes: [] };
  }

  return {
    minAmount: readNumber(value.minAmount),
    maxAmount: readNumber(value.maxAmount),
    departments: readStringArray(value.departments),
    documentTypes: readStringArray(value.documentTypes),
  };
}

export function parseApprovalRequestContext(value: unknown, entityType: string): ApprovalRequestContext {
  if (!isRecord(value)) {
    return { amount: null, department: null, documentType: entityType };
  }

  return {
    amount: readNumber(value.amount),
    department: readString(value.department),
    documentType: readString(value.documentType) ?? entityType,
  };
}

export function toApprovalConditionJson(conditions: ApprovalFlowConditions): Prisma.InputJsonObject {
  return {
    minAmount: conditions.minAmount,
    maxAmount: conditions.maxAmount,
    departments: conditions.departments,
    documentTypes: conditions.documentTypes,
  };
}

export function toApprovalRequestContextJson(context: ApprovalRequestContext): Prisma.InputJsonObject {
  return {
    amount: context.amount,
    department: context.department,
    documentType: context.documentType,
  };
}

export function evaluateApprovalConditions(
  rawConditions: unknown,
  rawContext: unknown,
  entityType: string,
): ApprovalConditionEvaluation {
  const conditions = parseApprovalFlowConditions(rawConditions);
  const context = parseApprovalRequestContext(rawContext, entityType);
  const reasons: string[] = [];

  if (conditions.minAmount !== null && (context.amount === null || context.amount < conditions.minAmount)) {
    reasons.push(`Tutar minimum limitin altinda: ${conditions.minAmount}`);
  }
  if (conditions.maxAmount !== null && (context.amount === null || context.amount > conditions.maxAmount)) {
    reasons.push(`Tutar maksimum limitin ustunde: ${conditions.maxAmount}`);
  }
  if (
    conditions.departments.length > 0 &&
    (context.department === null || !conditions.departments.map(normalizeText).includes(normalizeText(context.department)))
  ) {
    reasons.push(`Departman kosulu eslesmedi: ${conditions.departments.join(', ')}`);
  }
  if (
    conditions.documentTypes.length > 0 &&
    (context.documentType === null || !conditions.documentTypes.map(normalizeText).includes(normalizeText(context.documentType)))
  ) {
    reasons.push(`Belge turu kosulu eslesmedi: ${conditions.documentTypes.join(', ')}`);
  }

  return {
    matches: reasons.length === 0,
    reasons,
    conditions,
    context,
  };
}
