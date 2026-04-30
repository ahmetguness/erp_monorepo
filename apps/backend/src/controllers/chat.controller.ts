import { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { sanitizeOutput } from '../lib/output-sanitizer';
import { ValidationError } from '../errors';
import { Plan } from '@prisma/client';
import { handlePrivateChat, handlePrivateChatStream, clearConversation, type UserPermissions } from '../services/ai-chat.service';

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

/** Maksimum AI yanıt uzunluğu (karakter) — truncate edilir */
const MAX_RESPONSE_LENGTH = 4000;

// ─────────────────────────────────────────────
// In-memory rate limiter (production'da Redis kullan)
// ─────────────────────────────────────────────

interface RateEntry {
  minuteCount: number;
  minuteResetAt: number;
  dailyCount: number;
  dailyResetAt: number;
}

const rateLimits = new Map<string, RateEntry>();

// Rate limit entry'lerini periyodik temizle
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (now > entry.dailyResetAt) rateLimits.delete(key);
  }
}, 10 * 60 * 1000);

function checkChatRateLimit(userId: string, plan: Plan): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const key = `chat:${userId}`;
  let entry = rateLimits.get(key);

  const minuteLimit = PLAN_RATE_LIMITS[plan];
  const dailyLimit = PLAN_DAILY_LIMITS[plan];

  if (!entry) {
    entry = {
      minuteCount: 0,
      minuteResetAt: now + 60_000,
      dailyCount: 0,
      dailyResetAt: now + 86_400_000,
    };
    rateLimits.set(key, entry);
  }

  if (now > entry.minuteResetAt) {
    entry.minuteCount = 0;
    entry.minuteResetAt = now + 60_000;
  }

  if (now > entry.dailyResetAt) {
    entry.dailyCount = 0;
    entry.dailyResetAt = now + 86_400_000;
  }

  if (entry.minuteCount >= minuteLimit) {
    return { allowed: false, reason: `Dakika limiti aşıldı (${minuteLimit}/dk). Biraz bekleyin.` };
  }

  if (entry.dailyCount >= dailyLimit) {
    return { allowed: false, reason: `Günlük limit aşıldı (${dailyLimit}/gün). Yarın tekrar deneyin.` };
  }

  entry.minuteCount++;
  entry.dailyCount++;
  return { allowed: true };
}

// ─────────────────────────────────────────────
// Shared validation
// ─────────────────────────────────────────────

async function validateChatRequest(c: Context): Promise<
  | { error: Response }
  | { userId: string; tenantId: string; user: { name: string; isActive: boolean }; tenant: { companyName: string; plan: Plan; status: string; modules: string[] }; message: string; permissions: UserPermissions }
> {
  if (!OPENAI_API_KEY) {
    return { error: c.json({ error: 'Chatbot yapılandırılmamış.' }, 503) };
  }

  const userId = c.get('userId') as string;
  const tenantId = c.get('tenantId') as string;

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

  if (!user?.isActive) return { error: c.json({ error: 'Kullanıcı hesabı aktif değil.' }, 403) };
  if (!tenant || tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') {
    return { error: c.json({ error: 'Tenant hesabı aktif değil.' }, 403) };
  }

  const rateCheck = checkChatRateLimit(userId, tenant.plan);
  if (!rateCheck.allowed) return { error: c.json({ error: rateCheck.reason }, 429) };

  const body = await c.req.json<{ message?: string }>().catch(() => ({} as { message?: string }));
  const message = body.message?.trim();

  if (!message || message.length === 0) {
    return { error: c.json(new ValidationError('Mesaj boş olamaz.').toJSON(), 400) };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { error: c.json(new ValidationError(`Mesaj en fazla ${MAX_MESSAGE_LENGTH} karakter olabilir.`).toJSON(), 400) };
  }

  // Kullanıcı izinlerini derle
  const permissions: UserPermissions = {
    isOwner: tenantUser?.isOwner ?? false,
    modules: tenantUser?.roleRef?.permissions.map((p) => ({ module: p.module, action: p.action })) ?? [],
  };

  return { userId, tenantId, user: user!, tenant: tenant!, message, permissions };
}

// ─────────────────────────────────────────────
// Controller
// ─────────────────────────────────────────────

export const ChatController = {
  /** Klasik (non-streaming) endpoint — geriye uyumluluk */
  async send(c: Context): Promise<Response> {
    const v = await validateChatRequest(c);
    if ('error' in v) return v.error;

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

      return c.json({ output: finalOutput, usedTools: result.usedTools });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Chat: OpenAI hatası — ${errMsg}`);
      return c.json({ error: 'Asistan şu an yanıt veremiyor.' }, 502);
    }
  },

  /** SSE streaming endpoint */
  async sendStream(c: Context): Promise<Response> {
    const v = await validateChatRequest(c);
    if ('error' in v) return v.error;

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
              await s.writeSSE({ event: 'done', data: JSON.stringify({ output: finalOutput, usedTools }) });
            },
            async onError(error) {
              logger.error(`Chat stream: ${error}`);
              await s.writeSSE({ event: 'error', data: JSON.stringify({ error: 'Asistan şu an yanıt veremiyor.' }) });
            },
          },
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(`Chat stream unhandled: ${errMsg}`);
        await s.writeSSE({ event: 'error', data: JSON.stringify({ error: 'Asistan şu an yanıt veremiyor.' }) });
      }
    });
  },

  /** Konuşma geçmişini temizle (backend + frontend senkron) */
  async clear(c: Context): Promise<Response> {
    const userId = c.get('userId') as string;
    const tenantId = c.get('tenantId') as string;
    const sessionId = `private:${tenantId}:${userId}`;
    clearConversation(sessionId);
    return c.json({ success: true });
  },
};
