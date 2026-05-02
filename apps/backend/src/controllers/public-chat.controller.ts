import { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { logger } from '../lib/logger';
import { ValidationError } from '../errors';
import { handlePublicChat, handlePublicChatStream } from '../services/ai-chat.service';
import { createDemoRequest } from '../services/demo.service';
import { prisma } from '../lib/prisma';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/** Public chatbot rate limit — IP başına dakikada max mesaj */
const PUBLIC_RATE_LIMIT_PER_MINUTE = 10;
const PUBLIC_RATE_LIMIT_DAILY = 100;
const MAX_MESSAGE_LENGTH = 500;

// ─────────────────────────────────────────────
// In-memory rate limiter (IP bazlı)
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

function checkPublicRateLimit(ip: string): { allowed: boolean; reason?: string } {
  const now = Date.now();
  let entry = rateLimits.get(ip);

  if (!entry) {
    entry = {
      minuteCount: 0,
      minuteResetAt: now + 60_000,
      dailyCount: 0,
      dailyResetAt: now + 86_400_000,
    };
    rateLimits.set(ip, entry);
  }

  if (now > entry.minuteResetAt) {
    entry.minuteCount = 0;
    entry.minuteResetAt = now + 60_000;
  }

  if (now > entry.dailyResetAt) {
    entry.dailyCount = 0;
    entry.dailyResetAt = now + 86_400_000;
  }

  if (entry.minuteCount >= PUBLIC_RATE_LIMIT_PER_MINUTE) {
    return { allowed: false, reason: 'Çok fazla mesaj gönderdiniz. Biraz bekleyin.' };
  }

  if (entry.dailyCount >= PUBLIC_RATE_LIMIT_DAILY) {
    return { allowed: false, reason: 'Günlük mesaj limitine ulaştınız.' };
  }

  entry.minuteCount++;
  entry.dailyCount++;
  return { allowed: true };
}

// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────

async function buildChatDeps() {
  const createDemoFn = async (data: { fullName: string; companyName: string; email: string; phone: string; plan: string }) => {
    return createDemoRequest({
      fullName: data.fullName,
      companyName: data.companyName,
      email: data.email,
      phone: data.phone || undefined,
      plan: data.plan as 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE',
    });
  };

  const checkEmailFn = async (email: string) => {
    const normalized = email.toLowerCase().trim();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalized },
      include: { tenants: { where: { isActive: true }, include: { tenant: { select: { status: true } } } } },
    });
    if (existingUser?.tenants.some((tu) => tu.tenant.status === 'ACTIVE' || tu.tenant.status === 'TRIAL')) {
      return { available: false, message: 'Bu e-posta adresi ile zaten aktif bir hesap bulunmaktadır. Giriş yapmayı deneyin.' };
    }

    const activeDemo = await prisma.demoRequest.findFirst({ where: { email: normalized, status: 'PROVISIONED' } });
    if (activeDemo) return { available: false, message: 'Bu e-posta adresi için zaten aktif bir demo hesabı mevcut.' };

    const pending = await prisma.demoRequest.findFirst({
      where: { email: normalized, status: { in: ['PENDING', 'APPROVED', 'PROVISIONING'] } },
    });
    if (pending) return { available: false, message: 'Bu e-posta adresi için bekleyen bir demo talebi zaten bulunuyor.' };

    const recent = await prisma.demoRequest.findFirst({
      where: { email: normalized, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    if (recent) return { available: false, message: 'Bu e-posta ile son 24 saat içinde zaten bir demo talebi oluşturulmuş.' };

    return { available: true, message: 'E-posta adresi müsait.' };
  };

  return { createDemoFn, checkEmailFn };
}

function validatePublicRequest(c: Context): { error: Response } | { message: string; sessionId: string } {
  if (!OPENAI_API_KEY) return { error: c.json({ error: 'Chatbot yapılandırılmamış.' }, 503) };

  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'unknown';
  const rateCheck = checkPublicRateLimit(ip);
  if (!rateCheck.allowed) return { error: c.json({ error: rateCheck.reason }, 429) };

  return { message: '', sessionId: '' }; // placeholder — body parsed separately
}

// ─────────────────────────────────────────────
// Controller
// ─────────────────────────────────────────────

export const PublicChatController = {
  async send(c: Context): Promise<Response> {
    if (!OPENAI_API_KEY) {
      logger.error('PublicChat: OPENAI_API_KEY tanımlı değil.');
      return c.json({ error: 'Chatbot yapılandırılmamış.' }, 503);
    }

    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'unknown';
    const rateCheck = checkPublicRateLimit(ip);
    if (!rateCheck.allowed) return c.json({ error: rateCheck.reason }, 429);

    const body = await c.req.json<{ message?: string; sessionId?: string }>().catch(() => ({} as { message?: string; sessionId?: string }));
    const message = body.message?.trim();
    const rawSessionId = body.sessionId ?? `pub-${Date.now()}`;
    const sessionId = rawSessionId.slice(0, 64).replace(/[^a-zA-Z0-9\-_]/g, '');

    if (!message || message.length === 0) return c.json(new ValidationError('Mesaj boş olamaz.').toJSON(), 400);
    if (message.length > MAX_MESSAGE_LENGTH) return c.json(new ValidationError(`Mesaj en fazla ${MAX_MESSAGE_LENGTH} karakter olabilir.`).toJSON(), 400);

    try {
      const { createDemoFn, checkEmailFn } = await buildChatDeps();
      const result = await handlePublicChat({ message, sessionId: `public:${sessionId}` }, createDemoFn, checkEmailFn);
      return c.json({ output: result.output });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`PublicChat: OpenAI hatası — ${errMsg}`);
      return c.json({ error: 'Asistan şu an yanıt veremiyor.' }, 502);
    }
  },

  async sendStream(c: Context): Promise<Response> {
    if (!OPENAI_API_KEY) {
      logger.error('PublicChat: OPENAI_API_KEY tanımlı değil.');
      return c.json({ error: 'Chatbot yapılandırılmamış.' }, 503);
    }

    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'unknown';
    const rateCheck = checkPublicRateLimit(ip);
    if (!rateCheck.allowed) return c.json({ error: rateCheck.reason }, 429);

    const body = await c.req.json<{ message?: string; sessionId?: string }>().catch(() => ({} as { message?: string; sessionId?: string }));
    const message = body.message?.trim();
    const rawSessionId = body.sessionId ?? `pub-${Date.now()}`;
    const sessionId = rawSessionId.slice(0, 64).replace(/[^a-zA-Z0-9\-_]/g, '');

    if (!message || message.length === 0) return c.json(new ValidationError('Mesaj boş olamaz.').toJSON(), 400);
    if (message.length > MAX_MESSAGE_LENGTH) return c.json(new ValidationError(`Mesaj en fazla ${MAX_MESSAGE_LENGTH} karakter olabilir.`).toJSON(), 400);

    const { createDemoFn, checkEmailFn } = await buildChatDeps();

    return streamSSE(c, async (s) => {
      try {
        await handlePublicChatStream(
          { message, sessionId: `public:${sessionId}` },
          createDemoFn,
          checkEmailFn,
          {
            async onToken(token) {
              await s.writeSSE({ event: 'token', data: JSON.stringify({ token }) });
            },
            async onToolStart() { /* public chat'te tool_start göstermiyoruz */ },
            async onDone(fullText) {
              await s.writeSSE({ event: 'done', data: JSON.stringify({ output: fullText }) });
            },
            async onError(error) {
              logger.error(`PublicChat stream: ${error}`);
              await s.writeSSE({ event: 'error', data: JSON.stringify({ error: 'Asistan şu an yanıt veremiyor.' }) });
            },
          },
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(`PublicChat stream unhandled: ${errMsg}`);
        await s.writeSSE({ event: 'error', data: JSON.stringify({ error: 'Asistan şu an yanıt veremiyor.' }) });
      }
    });
  },
};
