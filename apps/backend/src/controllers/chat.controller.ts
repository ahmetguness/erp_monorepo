import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { generateServiceJwt, CHATBOT_SCOPES } from '../lib/service-jwt';
import { sanitizeOutput } from '../lib/output-sanitizer';
import { ValidationError } from '../errors';
import { Plan } from '@prisma/client';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const N8N_INTERNAL_URL = process.env.N8N_INTERNAL_WEBHOOK_URL;
const N8N_SHARED_SECRET = process.env.N8N_SHARED_SECRET;

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

  // Dakika reset
  if (now > entry.minuteResetAt) {
    entry.minuteCount = 0;
    entry.minuteResetAt = now + 60_000;
  }

  // Günlük reset
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
// Controller
// ─────────────────────────────────────────────

export const ChatController = {
  async send(c: Context): Promise<Response> {
    // ── 1. Config kontrolü ──
    if (!N8N_INTERNAL_URL || !N8N_SHARED_SECRET) {
      logger.error('Chat: N8N_INTERNAL_WEBHOOK_URL veya N8N_SHARED_SECRET tanımlı değil.');
      return c.json({ error: 'Chatbot yapılandırılmamış.' }, 503);
    }

    // ── 2. JWT'den güvenilir identity (manipüle edilemez) ──
    const userId = c.get('userId') as string;
    const tenantId = c.get('tenantId') as string;

    // ── 3. Tenant + User bilgilerini DB'den çek (client'a güvenme) ──
    const [user, tenant] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, isActive: true },
      }),
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { companyName: true, plan: true, status: true },
      }),
    ]);

    if (!user?.isActive) {
      return c.json({ error: 'Kullanıcı hesabı aktif değil.' }, 403);
    }

    if (!tenant || tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') {
      return c.json({ error: 'Tenant hesabı aktif değil.' }, 403);
    }

    // ── 4. Plan bazlı rate limit ──
    const rateCheck = checkChatRateLimit(userId, tenant.plan);
    if (!rateCheck.allowed) {
      return c.json({ error: rateCheck.reason }, 429);
    }

    // ── 5. Input validasyonu ──
    const body = await c.req.json<{ message?: string }>().catch(() => ({}));
    const message = body.message?.trim();

    if (!message || message.length === 0) {
      return c.json(new ValidationError('Mesaj boş olamaz.').toJSON(), 400);
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return c.json(
        new ValidationError(`Mesaj en fazla ${MAX_MESSAGE_LENGTH} karakter olabilir.`).toJSON(),
        400,
      );
    }

    // ── 6. Service JWT üret (kısa ömürlü, scope'lu) ──
    //    n8n bu token ile Axon API'ye istek atacak.
    //    tenantId token içinde → query/body'den ASLA alınmayacak.
    const serviceToken = generateServiceJwt(tenantId, userId, CHATBOT_SCOPES);

    // ── 7. n8n'e güvenli istek ──
    try {
      const n8nResponse = await fetch(N8N_INTERNAL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': N8N_SHARED_SECRET,
        },
        body: JSON.stringify({
          message,
          serviceToken,           // n8n bunu API çağrılarında kullanacak
          userName: user.name,    // sadece AI prompt context için
          tenantName: tenant.companyName,
          plan: tenant.plan,
        }),
        signal: AbortSignal.timeout(30_000), // 30s timeout
      });

      if (!n8nResponse.ok) {
        logger.error(`Chat: n8n HTTP ${n8nResponse.status}`);
        return c.json({ error: 'Asistan şu an yanıt veremiyor.' }, 502);
      }

      const contentType = n8nResponse.headers.get('content-type') ?? '';
      let output: string;
      let usedTools = false;

      if (contentType.includes('application/json')) {
        const data = await n8nResponse.json();
        output = data.output ?? data.response ?? data.message ?? data.text ?? '';
        usedTools = data.usedTools === true || (data.toolsUsed?.length ?? 0) > 0;
      } else {
        output = await n8nResponse.text();
      }

      if (!output || output.trim() === '') {
        return c.json({ output: 'Yanıt alınamadı. Lütfen tekrar deneyin.', usedTools: false });
      }

      // ── 8. Output sanitization — hassas veri maskeleme ──
      const sanitized = sanitizeOutput(output);

      if (sanitized.maskedCount > 0) {
        logger.warn(
          `Chat: ${sanitized.maskedCount} hassas veri maskelendi`,
          `[${sanitized.maskedTypes.join(', ')}]`,
          `tenant=${tenantId}`,
        );
      }

      // ── 9. Truncate (AI cost guard) ──
      const finalOutput = sanitized.text.length > MAX_RESPONSE_LENGTH
        ? sanitized.text.slice(0, MAX_RESPONSE_LENGTH) + '\n\n_(Yanıt kısaltıldı)_'
        : sanitized.text;

      return c.json({ output: finalOutput, usedTools });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        logger.error('Chat: n8n timeout (30s)');
        return c.json({ error: 'Asistan yanıt süresi aşıldı.' }, 504);
      }
      logger.error('Chat: Beklenmeyen hata', err);
      return c.json({ error: 'Asistan şu an yanıt veremiyor.' }, 502);
    }
  },
};
