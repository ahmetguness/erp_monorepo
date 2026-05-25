import { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { logger } from '../lib/logger';
import { ValidationError } from '../errors';
import { handlePublicChat, handlePublicChatStream } from '../services/ai-chat.service';
import { createDemoRequest } from '../services/demo.service';
import { prisma } from '../lib/prisma';
import { sanitizeOutput } from '../lib/output-sanitizer';
import { rateLimiter } from '../lib/rateLimiter';
import { AiPermissionCheckResult, AiRequestStatus, AiRequestType } from '@prisma/client';
import { AI_MODELS, AI_PROMPT_VERSIONS, recordAiRequestLog } from '../services/ai-governance.service';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PUBLIC_RATE_LIMIT_PER_MINUTE = 10;
const PUBLIC_RATE_LIMIT_DAILY = 100;
const PUBLIC_SESSION_DAILY_LIMIT = Number(process.env.PUBLIC_CHAT_SESSION_DAILY_LIMIT ?? '30');
const PUBLIC_DAILY_REQUEST_BUDGET = Number(process.env.PUBLIC_CHAT_DAILY_REQUEST_BUDGET ?? '1000');
const MAX_MESSAGE_LENGTH = 500;

function getClientIp(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'unknown';
}

async function checkPublicRateLimit(ip: string, sessionId: string): Promise<{ allowed: boolean; reason?: string }> {
  const dayKey = new Date().toISOString().slice(0, 10);

  const budgetExceeded = await rateLimiter.check(`pubchat_budget:${dayKey}`, PUBLIC_DAILY_REQUEST_BUDGET, 86_400_000);
  if (budgetExceeded) return { allowed: false, reason: 'Gunluk asistan kapasitesi doldu. Lutfen daha sonra tekrar deneyin.' };

  const dailyExceeded = await rateLimiter.check(`pubchat_d:${ip}`, PUBLIC_RATE_LIMIT_DAILY, 86_400_000);
  if (dailyExceeded) return { allowed: false, reason: 'Gunluk mesaj limitine ulastiniz.' };

  const minuteExceeded = await rateLimiter.check(`pubchat_m:${ip}`, PUBLIC_RATE_LIMIT_PER_MINUTE, 60_000);
  if (minuteExceeded) return { allowed: false, reason: 'Cok fazla mesaj gonderdiniz. Biraz bekleyin.' };

  const sessionExceeded = await rateLimiter.check(`pubchat_s:${sessionId}`, PUBLIC_SESSION_DAILY_LIMIT, 86_400_000);
  if (sessionExceeded) return { allowed: false, reason: 'Bu sohbet icin gunluk mesaj limitine ulastiniz.' };

  return { allowed: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePublicChatBody(value: unknown): { message: string; sessionId: string } | ValidationError {
  if (!isRecord(value)) return new ValidationError('Gecersiz istek govdesi.');

  const message = typeof value.message === 'string' ? value.message.trim() : '';
  const rawSessionId = typeof value.sessionId === 'string' && value.sessionId.trim()
    ? value.sessionId.trim()
    : `pub-${Date.now()}`;
  const sessionId = rawSessionId.slice(0, 64).replace(/[^a-zA-Z0-9\-_]/g, '') || `pub-${Date.now()}`;

  if (!message) return new ValidationError('Mesaj bos olamaz.');
  if (message.length > MAX_MESSAGE_LENGTH) return new ValidationError(`Mesaj en fazla ${MAX_MESSAGE_LENGTH} karakter olabilir.`);

  return { message, sessionId };
}

async function buildChatDeps() {
  const createDemoFn = async (data: { fullName: string; companyName: string; email: string; phone: string; plan: string }) => {
    const plan = data.plan === 'PROFESSIONAL' || data.plan === 'ENTERPRISE' ? data.plan : 'STARTER';
    return createDemoRequest({
      fullName: data.fullName,
      companyName: data.companyName,
      email: data.email,
      phone: data.phone || undefined,
      plan,
    });
  };

  const checkEmailFn = async (email: string) => {
    const normalized = email.toLowerCase().trim();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalized },
      include: { tenants: { where: { isActive: true }, include: { tenant: { select: { status: true } } } } },
    });
    if (existingUser?.tenants.some((tu) => tu.tenant.status === 'ACTIVE' || tu.tenant.status === 'TRIAL')) {
      return { available: false, message: 'Bu e-posta adresi ile zaten aktif bir hesap bulunmaktadir. Giris yapmayi deneyin.' };
    }

    const activeDemo = await prisma.demoRequest.findFirst({ where: { email: normalized, status: 'PROVISIONED' } });
    if (activeDemo) return { available: false, message: 'Bu e-posta adresi icin zaten aktif bir demo hesabi mevcut.' };

    const pending = await prisma.demoRequest.findFirst({
      where: { email: normalized, status: { in: ['PENDING', 'APPROVED', 'PROVISIONING'] } },
    });
    if (pending) return { available: false, message: 'Bu e-posta adresi icin bekleyen bir demo talebi zaten bulunuyor.' };

    const recent = await prisma.demoRequest.findFirst({
      where: { email: normalized, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    if (recent) return { available: false, message: 'Bu e-posta ile son 24 saat icinde zaten bir demo talebi olusturulmus.' };

    return { available: true, message: 'E-posta adresi musait.' };
  };

  return { createDemoFn, checkEmailFn };
}

export const PublicChatController = {
  async send(c: Context): Promise<Response> {
    if (!OPENAI_API_KEY) {
      logger.error('PublicChat: OPENAI_API_KEY tanimli degil.');
      return c.json({ error: 'Chatbot yapilandirilmamis.' }, 503);
    }

    const parsed = parsePublicChatBody(await c.req.json<unknown>().catch(() => null));
    if (parsed instanceof ValidationError) return c.json(parsed.toJSON(), 400);

    const rateCheck = await checkPublicRateLimit(getClientIp(c), parsed.sessionId);
    if (!rateCheck.allowed) return c.json({ error: rateCheck.reason }, 429);
    const ipAddress = getClientIp(c);
    const userAgent = c.req.header('user-agent') ?? null;

    try {
      const { createDemoFn, checkEmailFn } = await buildChatDeps();
      const result = await handlePublicChat({ message: parsed.message, sessionId: `public:${parsed.sessionId}` }, createDemoFn, checkEmailFn);
      const sanitized = sanitizeOutput(result.output, true);
      await recordAiRequestLog({
        tenantId: null,
        userId: null,
        requestType: AiRequestType.PUBLIC_CHAT,
        promptVersion: result.governance.promptVersion,
        model: result.governance.model,
        permissionCheckResult: AiPermissionCheckResult.NOT_REQUIRED,
        redactedFields: sanitized.maskedTypes,
        inputText: parsed.message,
        outputText: sanitized.text,
        status: AiRequestStatus.SUCCEEDED,
        usedTools: false,
        tokenUsage: result.governance.tokenUsage,
        ipAddress,
        userAgent,
        isPublicOutput: true,
      });
      return c.json({ output: sanitized.text });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`PublicChat: OpenAI hatasi - ${errMsg}`);
      await recordAiRequestLog({
        requestType: AiRequestType.PUBLIC_CHAT,
        promptVersion: AI_PROMPT_VERSIONS.PUBLIC_CHAT,
        model: AI_MODELS.CHAT,
        permissionCheckResult: AiPermissionCheckResult.NOT_REQUIRED,
        inputText: parsed.message,
        status: AiRequestStatus.FAILED,
        errorMessage: errMsg,
        ipAddress,
        userAgent,
        isPublicOutput: true,
      });
      return c.json({ error: 'Asistan su an yanit veremiyor.' }, 502);
    }
  },

  async sendStream(c: Context): Promise<Response> {
    if (!OPENAI_API_KEY) {
      logger.error('PublicChat: OPENAI_API_KEY tanimli degil.');
      return c.json({ error: 'Chatbot yapilandirilmamis.' }, 503);
    }

    const parsed = parsePublicChatBody(await c.req.json<unknown>().catch(() => null));
    if (parsed instanceof ValidationError) return c.json(parsed.toJSON(), 400);

    const rateCheck = await checkPublicRateLimit(getClientIp(c), parsed.sessionId);
    if (!rateCheck.allowed) return c.json({ error: rateCheck.reason }, 429);
    const ipAddress = getClientIp(c);
    const userAgent = c.req.header('user-agent') ?? null;

    const { createDemoFn, checkEmailFn } = await buildChatDeps();

    return streamSSE(c, async (s) => {
      try {
        await handlePublicChatStream(
          { message: parsed.message, sessionId: `public:${parsed.sessionId}` },
          createDemoFn,
          checkEmailFn,
          {
            async onToken(token) {
              const sanitized = sanitizeOutput(token, true);
              await s.writeSSE({ event: 'token', data: JSON.stringify({ token: sanitized.text }) });
            },
            async onToolStart() {
              // Public chat does not expose tool internals.
            },
            async onDone(fullText) {
              const sanitized = sanitizeOutput(fullText, true);
              await recordAiRequestLog({
                requestType: AiRequestType.PUBLIC_CHAT,
                promptVersion: AI_PROMPT_VERSIONS.PUBLIC_CHAT_STREAM,
                model: AI_MODELS.CHAT,
                permissionCheckResult: AiPermissionCheckResult.NOT_REQUIRED,
                redactedFields: sanitized.maskedTypes,
                inputText: parsed.message,
                outputText: sanitized.text,
                status: AiRequestStatus.SUCCEEDED,
                ipAddress,
                userAgent,
                isPublicOutput: true,
              });
              await s.writeSSE({ event: 'done', data: JSON.stringify({ output: sanitized.text }) });
            },
            async onError(error) {
              logger.error(`PublicChat stream: ${error}`);
              await recordAiRequestLog({
                requestType: AiRequestType.PUBLIC_CHAT,
                promptVersion: AI_PROMPT_VERSIONS.PUBLIC_CHAT_STREAM,
                model: AI_MODELS.CHAT,
                permissionCheckResult: AiPermissionCheckResult.NOT_REQUIRED,
                inputText: parsed.message,
                status: AiRequestStatus.FAILED,
                errorMessage: String(error),
                ipAddress,
                userAgent,
                isPublicOutput: true,
              });
              await s.writeSSE({ event: 'error', data: JSON.stringify({ error: 'Asistan su an yanit veremiyor.' }) });
            },
          },
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(`PublicChat stream unhandled: ${errMsg}`);
        await recordAiRequestLog({
          requestType: AiRequestType.PUBLIC_CHAT,
          promptVersion: AI_PROMPT_VERSIONS.PUBLIC_CHAT_STREAM,
          model: AI_MODELS.CHAT,
          permissionCheckResult: AiPermissionCheckResult.NOT_REQUIRED,
          inputText: parsed.message,
          status: AiRequestStatus.FAILED,
          errorMessage: errMsg,
          ipAddress,
          userAgent,
          isPublicOutput: true,
        });
        await s.writeSSE({ event: 'error', data: JSON.stringify({ error: 'Asistan su an yanit veremiyor.' }) });
      }
    });
  },
};
