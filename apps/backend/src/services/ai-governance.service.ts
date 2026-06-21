import { AiPermissionCheckResult, AiRequestStatus, AiRequestType, EntityType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { sanitizeOutput } from '../lib/output-sanitizer';
import type { AiGovernancePolicy } from './ai/policy.service.js';

export const AI_PROMPT_VERSIONS = {
  PRIVATE_CHAT: 'private-chat:v2',
  PRIVATE_CHAT_STREAM: 'private-chat-stream:v2',
  PUBLIC_CHAT: 'public-chat:v1',
  PUBLIC_CHAT_STREAM: 'public-chat-stream:v1',
  MAIL_DRAFT: 'mail-draft:v1',
} as const;

export const AI_MODELS = {
  CHAT: 'gpt-4o-mini',
  MAIL_DRAFT: 'gpt-4o-mini',
} as const;

export interface AiTokenUsage {
  prompt?: number | null;
  completion?: number | null;
  total?: number | null;
}

export interface AiGovernanceLogInput {
  tenantId?: string | null;
  userId?: string | null;
  requestType: AiRequestType;
  promptVersion: string;
  model: string;
  entityType?: EntityType | null;
  entityId?: string | null;
  entityContext?: unknown;
  permissionCheckResult: AiPermissionCheckResult;
  redactedFields?: string[];
  inputText?: string | null;
  outputText?: string | null;
  draft?: unknown;
  result?: unknown;
  userApprovedAction?: string | null;
  policy?: AiGovernancePolicy;
  status: AiRequestStatus;
  usedTools?: boolean;
  tokenUsage?: AiTokenUsage;
  errorMessage?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  isPublicOutput?: boolean;
}

export interface AiGovernanceListParams {
  contextTenantId: string;
  page: number;
  limit: number;
  requestType?: AiRequestType;
  status?: AiRequestStatus;
  userId?: string;
}

const MAX_SUMMARY_LENGTH = 700;
const MAX_ERROR_LENGTH = 500;
const ESTIMATED_USD_PER_1K_TOKENS = 0.0003;

function compactText(value: string | null | undefined): string | null {
  if (!value) return null;
  const compacted = value.replace(/\s+/g, ' ').trim();
  return compacted.length > 0 ? compacted.slice(0, MAX_SUMMARY_LENGTH) : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => toJsonValue(item))
      .filter((item): item is Prisma.InputJsonValue => item !== undefined);
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).flatMap(([key, rawValue]) => {
      const jsonValue = toJsonValue(rawValue);
      return jsonValue === undefined ? [] : [[key, jsonValue] as const];
    });
    return Object.fromEntries(entries) as Prisma.InputJsonObject;
  }
  return String(value);
}

function estimateCostUsd(tokenUsage: AiTokenUsage | undefined): number | null {
  const total = tokenUsage?.total;
  if (typeof total !== 'number' || total <= 0) return null;
  return Number(((total / 1000) * ESTIMATED_USD_PER_1K_TOKENS).toFixed(6));
}

function buildGovernanceResult(input: AiGovernanceLogInput): Prisma.InputJsonValue | undefined {
  const result = toJsonValue(input.result);
  const tokenCost = estimateCostUsd(input.tokenUsage);
  const governanceMeta: Prisma.InputJsonObject = {
    tokenCostEstimateUsd: tokenCost,
    policy: input.policy ? toJsonValue(input.policy) ?? null : null,
  };

  if (result === undefined) return governanceMeta;
  if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
    return { ...result, governance: governanceMeta };
  }
  return { value: result, governance: governanceMeta };
}

function redactSummary(text: string | null | undefined, isPublic: boolean): { summary: string | null; fields: string[] } {
  const compacted = compactText(text);
  if (!compacted) return { summary: null, fields: [] };
  const sanitized = sanitizeOutput(compacted, isPublic);
  return { summary: sanitized.text, fields: sanitized.maskedTypes };
}

export function mapAiEntityType(value: string | undefined | null): EntityType | null {
  switch (value) {
    case 'contact':
      return EntityType.CONTACT;
    case 'invoice':
      return EntityType.INVOICE;
    case 'sales_quote':
      return EntityType.SALES_QUOTE;
    case 'sales_order':
      return EntityType.SALES_ORDER;
    case 'employee':
      return EntityType.EMPLOYEE;
    case 'product':
      return EntityType.PRODUCT;
    default:
      return null;
  }
}

export async function recordAiRequestLog(input: AiGovernanceLogInput): Promise<void> {
  const inputSummary = redactSummary(input.inputText, input.isPublicOutput ?? false);
  const outputSummary = redactSummary(input.outputText, input.isPublicOutput ?? false);
  const redactedFields = unique([
    ...(input.redactedFields ?? []),
    ...inputSummary.fields,
    ...outputSummary.fields,
  ]);

  try {
    await prisma.aiRequestLog.create({
      data: {
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        requestType: input.requestType,
        promptVersion: input.promptVersion,
        model: input.model,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        entityContext: toJsonValue(input.entityContext),
        permissionCheckResult: input.permissionCheckResult,
        redactedFields,
        inputSummary: inputSummary.summary,
        outputSummary: outputSummary.summary,
        draft: toJsonValue(input.draft),
        result: buildGovernanceResult(input),
        userApprovedAction: input.userApprovedAction ?? null,
        status: input.status,
        usedTools: input.usedTools ?? false,
        tokenPrompt: input.tokenUsage?.prompt ?? null,
        tokenCompletion: input.tokenUsage?.completion ?? null,
        tokenTotal: input.tokenUsage?.total ?? null,
        errorMessage: input.errorMessage ? input.errorMessage.slice(0, MAX_ERROR_LENGTH) : null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        completedAt: input.status === AiRequestStatus.STARTED ? null : new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`AI governance log write failed: ${message}`);
  }
}

export async function listAiRequestLogs(params: AiGovernanceListParams) {
  const skip = (params.page - 1) * params.limit;
  const where = {
    tenantId: params.contextTenantId,
    ...(params.requestType && { requestType: params.requestType }),
    ...(params.status && { status: params.status }),
    ...(params.userId && { userId: params.userId }),
  };

  const [total, data] = await prisma.$transaction([
    prisma.aiRequestLog.count({ where }),
    prisma.aiRequestLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: params.limit,
      select: {
        id: true,
        userId: true,
        requestType: true,
        promptVersion: true,
        model: true,
        entityType: true,
        entityId: true,
        entityContext: true,
        permissionCheckResult: true,
        redactedFields: true,
        inputSummary: true,
        outputSummary: true,
        draft: true,
        result: true,
        userApprovedAction: true,
        status: true,
        usedTools: true,
        tokenPrompt: true,
        tokenCompletion: true,
        tokenTotal: true,
        errorMessage: true,
        createdAt: true,
        completedAt: true,
      },
    }),
  ]);

  return {
    data,
    meta: {
      total,
      page: params.page,
      pageSize: params.limit,
      totalPages: Math.ceil(total / params.limit),
    },
  };
}
