import { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { sanitizeOutput } from '../lib/output-sanitizer';
import { ValidationError } from '../errors';
import { AiPermissionCheckResult, AiRequestStatus, AiRequestType, Plan } from '@prisma/client';
import { handlePrivateChat, handlePrivateChatStream, clearConversation, type UserPermissions } from '../services/ai-chat.service';
import { CHAT_ENTITY_TYPES, type ChatEntityType, type ChatPageContext, type ChatRecentRecord } from '../services/chat-context.service';
import { requireTenantId } from '../utils/context.js';
import { getRequestMeta } from '../utils/audit.js';
import { AI_MODELS, AI_PROMPT_VERSIONS, mapAiEntityType, recordAiRequestLog } from '../services/ai-governance.service';
import { assertAiAllowed, buildPolicyContext, type AiGovernancePolicy } from '../services/ai/policy.service.js';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/** Plan bazlı rate limit — dakika başına mesaj */
const PLAN_RATE_LIMITS: Record<Plan, number> = {
  STARTER: 10,
  PROFESSIONAL: 30,
  ENTERPRISE: 60,
};

/** Plan bazlı günlük limit */
const PLAN_DAILY_LIMITS: Record<Plan, number> = {
  STARTER: 50,
  PROFESSIONAL: 200,
  ENTERPRISE: 1000,
};

/** Maksimum mesaj uzunluğu (karakter) */
const MAX_MESSAGE_LENGTH = 1000;
const MAX_CONTEXT_TEXT_LENGTH = 160;
const MAX_CONTEXT_PATH_LENGTH = 240;
const MAX_RECENT_RECORDS = 8;

/** Maksimum AI yanıt uzunluğu (karakter) — truncate edilir */
const MAX_RESPONSE_LENGTH = 4000;

// ─────────────────────────────────────────────
import { rateLimiter } from '../lib/rateLimiter';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function parseEntityType(value: unknown): ChatEntityType | undefined {
  if (typeof value !== 'string') return undefined;
  return CHAT_ENTITY_TYPES.find((entityType) => entityType === value);
}

function parseRecentRecord(value: unknown): ChatRecentRecord | null {
  if (!isRecord(value)) return null;

  const entityType = parseEntityType(value.entityType);
  const entityId = readString(value.entityId, MAX_CONTEXT_TEXT_LENGTH);
  const label = readString(value.label, MAX_CONTEXT_TEXT_LENGTH);
  const path = readString(value.path, MAX_CONTEXT_PATH_LENGTH);
  const viewedAt = readString(value.viewedAt, MAX_CONTEXT_TEXT_LENGTH);

  if (!entityType || !entityId || !label || !path || !viewedAt) return null;
  return { entityType, entityId, label, path, viewedAt };
}

function parseChatPageContext(value: unknown): ChatPageContext | undefined {
  if (!isRecord(value)) return undefined;

  const path = readString(value.path, MAX_CONTEXT_PATH_LENGTH);
  if (!path) return undefined;

  const recentRecordsValue = Array.isArray(value.recentRecords) ? value.recentRecords : [];
  const recentRecords = recentRecordsValue
    .slice(0, MAX_RECENT_RECORDS)
    .flatMap((record) => {
      const parsed = parseRecentRecord(record);
      return parsed ? [parsed] : [];
    });

  return {
    path,
    title: readString(value.title, MAX_CONTEXT_TEXT_LENGTH),
    entityType: parseEntityType(value.entityType),
    entityId: readString(value.entityId, MAX_CONTEXT_TEXT_LENGTH),
    entityLabel: readString(value.entityLabel, MAX_CONTEXT_TEXT_LENGTH),
    recentRecords,
  };
}

function toAiPermissionResult(value: 'ALLOWED' | 'PARTIAL' | 'DENIED'): AiPermissionCheckResult {
  switch (value) {
    case 'ALLOWED':
      return AiPermissionCheckResult.ALLOWED;
    case 'PARTIAL':
      return AiPermissionCheckResult.PARTIAL;
    case 'DENIED':
      return AiPermissionCheckResult.DENIED;
  }
}

async function checkChatRateLimit(userId: string, plan: Plan): Promise<{ allowed: boolean; reason?: string }> {
  const minuteLimit = PLAN_RATE_LIMITS[plan];
  const dailyLimit = PLAN_DAILY_LIMITS[plan];

  const dailyExceeded = await rateLimiter.check(`chat_d:${userId}`, dailyLimit, 86_400_000);
  if (dailyExceeded) {
    return { allowed: false, reason: `Günlük limit aşıldı (${dailyLimit}/gün). Yarın tekrar deneyin.` };
  }

  const minuteExceeded = await rateLimiter.check(`chat_m:${userId}`, minuteLimit, 60_000);
  if (minuteExceeded) {
    return { allowed: false, reason: `Dakika limiti aşıldı (${minuteLimit}/dk). Biraz bekleyin.` };
  }

  return { allowed: true };
}

// ─────────────────────────────────────────────
// Shared validation
// ─────────────────────────────────────────────

async function validateChatRequest(c: Context): Promise<
  | { error: Response }
  | { userId: string; tenantId: string; user: { name: string; isActive: boolean }; tenant: { companyName: string; plan: Plan; status: string; modules: string[] }; message: string; permissions: UserPermissions; context?: ChatPageContext; policy: AiGovernancePolicy }
> {
  if (!OPENAI_API_KEY) {
    return { error: c.json({ error: 'Chatbot yapılandırılmamış.' }, 503) };
  }

  const userId = c.get('userId') as string;
  const tenantId = requireTenantId(c);

  const [user, tenant, tenantUser] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, isActive: true } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { companyName: true, plan: true, status: true, modules: true } }),
    prisma.tenantUser.findFirst({
      where: { tenantId, userId, isActive: true },
      select: {
        isOwner: true,
        roleRef: {
          select: {
            permissions: { select: { module: true, action: true } },
          },
        },
      },
    }),
  ]);

  if (!user || !user.isActive) return { error: c.json({ error: 'Kullanıcı hesabı aktif değil.' }, 403) };
  if (!tenant || tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') {
    return { error: c.json({ error: 'Tenant hesabı aktif değil.' }, 403) };
  }

  const rateCheck = await checkChatRateLimit(userId, tenant.plan);
  if (!rateCheck.allowed) return { error: c.json({ error: rateCheck.reason }, 429) };

  const body = await c.req.json().catch(() => null);
  const messageValue = isRecord(body) ? body.message : undefined;
  const message = typeof messageValue === 'string' ? messageValue.trim() : '';

  if (!message || message.length === 0) {
    return { error: c.json(new ValidationError('Mesaj boş olamaz.').toJSON(), 400) };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { error: c.json(new ValidationError(`Mesaj en fazla ${MAX_MESSAGE_LENGTH} karakter olabilir.`).toJSON(), 400) };
  }

  const context = parseChatPageContext(isRecord(body) ? body.context : undefined);

  const aiDecision = await assertAiAllowed(prisma, tenantId);
  if (!aiDecision.allowed) {
    const requestMeta = getRequestMeta(c);
    await recordAiRequestLog({
      tenantId,
      userId,
      requestType: AiRequestType.PRIVATE_CHAT,
      promptVersion: AI_PROMPT_VERSIONS.PRIVATE_CHAT,
      model: AI_MODELS.CHAT,
      entityType: mapAiEntityType(context?.entityType),
      entityId: context?.entityId ?? null,
      entityContext: context ? { ...buildPolicyContext(aiDecision.policy), path: context.path } : buildPolicyContext(aiDecision.policy),
      permissionCheckResult: AiPermissionCheckResult.DENIED,
      inputText: message,
      status: AiRequestStatus.FAILED,
      errorMessage: aiDecision.reason,
      policy: aiDecision.policy,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
    });
    return { error: c.json({ error: 'AI asistan bu tenant icin kapali.' }, 403) };
  }

  // Kullanıcı izinlerini derle
  const permissions: UserPermissions = {
    isOwner: tenantUser?.isOwner ?? false,
    modules: tenantUser?.roleRef?.permissions.map((p) => ({ module: p.module, action: p.action })) ?? [],
  };

  return { userId, tenantId, user, tenant, message, permissions, context, policy: aiDecision.policy };
}

// ─────────────────────────────────────────────
// Controller
// ─────────────────────────────────────────────

export const ChatController = {
  /** Klasik (non-streaming) endpoint — geriye uyumluluk */
  async send(c: Context): Promise<Response> {
    const v = await validateChatRequest(c);
    if ('error' in v) return v.error;
    const requestMeta = getRequestMeta(c);

    try {
      const result = await handlePrivateChat({
        message: v.message,
        tenantId: v.tenantId,
        userId: v.userId,
        userName: v.user.name,
        tenantName: v.tenant.companyName,
        plan: v.tenant.plan,
        permissions: v.permissions,
        tenantModules: v.tenant.modules,
        context: v.context,
      });

      if (!result.output || result.output.trim() === '') {
        return c.json({ output: 'Yanıt alınamadı. Lütfen tekrar deneyin.', usedTools: false });
      }

      const sanitized = sanitizeOutput(result.output);
      if (sanitized.maskedCount > 0) {
        logger.warn(`Chat: ${sanitized.maskedCount} hassas veri maskelendi [${sanitized.maskedTypes.join(', ')}] tenant=${v.tenantId}`);
      }

      const finalOutput = sanitized.text.length > MAX_RESPONSE_LENGTH
        ? sanitized.text.slice(0, MAX_RESPONSE_LENGTH) + '\n\n_(Yanıt kısaltıldı)_'
        : sanitized.text;

      await recordAiRequestLog({
        tenantId: v.tenantId,
        userId: v.userId,
        requestType: AiRequestType.PRIVATE_CHAT,
        promptVersion: result.governance.promptVersion,
        model: result.governance.model,
        entityType: mapAiEntityType(v.context?.entityType),
        entityId: v.context?.entityId ?? null,
        entityContext: { ...result.governance.entityContext, ...buildPolicyContext(v.policy) },
        permissionCheckResult: toAiPermissionResult(result.governance.permissionCheckResult),
        redactedFields: sanitized.maskedTypes,
        inputText: v.message,
        outputText: finalOutput,
        status: AiRequestStatus.SUCCEEDED,
        usedTools: result.usedTools,
        tokenUsage: result.governance.tokenUsage,
        policy: v.policy,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
      });

      return c.json({ output: finalOutput, usedTools: result.usedTools });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Chat: OpenAI hatası — ${errMsg}`);
      await recordAiRequestLog({
        tenantId: v.tenantId,
        userId: v.userId,
        requestType: AiRequestType.PRIVATE_CHAT,
        promptVersion: AI_PROMPT_VERSIONS.PRIVATE_CHAT,
        model: AI_MODELS.CHAT,
        entityType: mapAiEntityType(v.context?.entityType),
        entityId: v.context?.entityId ?? null,
        entityContext: v.context
          ? { path: v.context.path, entityType: v.context.entityType ?? null, entityId: v.context.entityId ?? null }
          : buildPolicyContext(v.policy),
        permissionCheckResult: AiPermissionCheckResult.PARTIAL,
        inputText: v.message,
        status: AiRequestStatus.FAILED,
        errorMessage: errMsg,
        policy: v.policy,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
      });
      return c.json({ error: 'Asistan şu an yanıt veremiyor.' }, 502);
    }
  },

  /** SSE streaming endpoint */
  async sendStream(c: Context): Promise<Response> {
    const v = await validateChatRequest(c);
    if ('error' in v) return v.error;
    const requestMeta = getRequestMeta(c);

    return streamSSE(c, async (s) => {
      let accumulatedRaw = '';
      let lastSanitizedLength = 0;

      try {
        await handlePrivateChatStream(
          {
            message: v.message,
            tenantId: v.tenantId,
            userId: v.userId,
            userName: v.user.name,
            tenantName: v.tenant.companyName,
            plan: v.tenant.plan,
            permissions: v.permissions,
            tenantModules: v.tenant.modules,
            context: v.context,
          },
          {
            async onToken(token) {
              accumulatedRaw += token;
              const sanitized = sanitizeOutput(accumulatedRaw).text;
              const newPart = sanitized.slice(lastSanitizedLength);
              lastSanitizedLength = sanitized.length;
              if (newPart) {
                await s.writeSSE({ event: 'token', data: JSON.stringify({ token: newPart }) });
              }
            },
            async onToolStart() {
              await s.writeSSE({ event: 'tool_start', data: '{}' });
            },
            async onDone(fullText, usedTools) {
              const sanitized = sanitizeOutput(fullText);
              if (sanitized.maskedCount > 0) {
                logger.warn(`Chat: ${sanitized.maskedCount} hassas veri maskelendi [${sanitized.maskedTypes.join(', ')}] tenant=${v.tenantId}`);
              }
              const finalOutput = sanitized.text.length > MAX_RESPONSE_LENGTH
                ? sanitized.text.slice(0, MAX_RESPONSE_LENGTH) + '\n\n_(Yanıt kısaltıldı)_'
                : sanitized.text;
              await recordAiRequestLog({
                tenantId: v.tenantId,
                userId: v.userId,
                requestType: AiRequestType.PRIVATE_CHAT,
                promptVersion: AI_PROMPT_VERSIONS.PRIVATE_CHAT_STREAM,
                model: AI_MODELS.CHAT,
                entityType: mapAiEntityType(v.context?.entityType),
                entityId: v.context?.entityId ?? null,
                entityContext: v.context
                  ? {
                      path: v.context.path,
                      entityType: v.context.entityType ?? null,
                      entityId: v.context.entityId ?? null,
                      recentRecordCount: v.context.recentRecords.length,
                      ...buildPolicyContext(v.policy),
                    }
                  : buildPolicyContext(v.policy),
                permissionCheckResult: AiPermissionCheckResult.ALLOWED,
                redactedFields: sanitized.maskedTypes,
                inputText: v.message,
                outputText: finalOutput,
                status: AiRequestStatus.SUCCEEDED,
                usedTools,
                policy: v.policy,
                ipAddress: requestMeta.ipAddress,
                userAgent: requestMeta.userAgent,
              });
              await s.writeSSE({ event: 'done', data: JSON.stringify({ output: finalOutput, usedTools }) });
            },
            async onError(error) {
              logger.error(`Chat stream: ${error}`);
              await recordAiRequestLog({
                tenantId: v.tenantId,
                userId: v.userId,
                requestType: AiRequestType.PRIVATE_CHAT,
                promptVersion: AI_PROMPT_VERSIONS.PRIVATE_CHAT_STREAM,
                model: AI_MODELS.CHAT,
                entityType: mapAiEntityType(v.context?.entityType),
                entityId: v.context?.entityId ?? null,
                permissionCheckResult: AiPermissionCheckResult.PARTIAL,
                inputText: v.message,
                status: AiRequestStatus.FAILED,
                errorMessage: String(error),
                policy: v.policy,
                ipAddress: requestMeta.ipAddress,
                userAgent: requestMeta.userAgent,
              });
              await s.writeSSE({ event: 'error', data: JSON.stringify({ error: 'Asistan şu an yanıt veremiyor.' }) });
            },
          },
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(`Chat stream unhandled: ${errMsg}`);
        await recordAiRequestLog({
          tenantId: v.tenantId,
          userId: v.userId,
          requestType: AiRequestType.PRIVATE_CHAT,
          promptVersion: AI_PROMPT_VERSIONS.PRIVATE_CHAT_STREAM,
          model: AI_MODELS.CHAT,
          entityType: mapAiEntityType(v.context?.entityType),
          entityId: v.context?.entityId ?? null,
          permissionCheckResult: AiPermissionCheckResult.PARTIAL,
          inputText: v.message,
          status: AiRequestStatus.FAILED,
          errorMessage: errMsg,
          policy: v.policy,
          ipAddress: requestMeta.ipAddress,
          userAgent: requestMeta.userAgent,
        });
        await s.writeSSE({ event: 'error', data: JSON.stringify({ error: 'Asistan şu an yanıt veremiyor.' }) });
      }
    });
  },

  /** Konuşma geçmişini temizle (backend + frontend senkron) */
  async clear(c: Context): Promise<Response> {
    const userId = c.get('userId') as string;
    const tenantId = requireTenantId(c);
    const sessionId = `private:${tenantId}:${userId}`;
    clearConversation(sessionId);
    return c.json({ success: true });
  },
};
