import { Context } from 'hono';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { ValidationError } from '../errors';
import { logger } from '../lib/logger';

import { rateLimiter } from '../lib/rateLimiter';

const RATE_LIMIT = 5;
const RATE_WINDOW = 15 * 60 * 1000;

/** Timing-safe token karşılaştırma */
function tokensMatch(storedHash: string | null, rawToken: string): boolean {
  if (!storedHash) return false;
  try {
    const incomingHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(incomingHash));
  } catch {
    return false;
  }
}

interface SetPasswordBody {
  token: string;
  email: string;
  password: string;
}

interface ValidateTokenBody {
  token: string;
  email: string;
}

export class SetPasswordController {
  /**
   * POST /public/set-password
   * Token ile şifre belirleme (demo + password reset).
   */
  static async setPassword(c: Context) {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    if (await rateLimiter.check(`set-password:${ip}`, RATE_LIMIT, RATE_WINDOW)) {
      return c.json({ error: 'Çok fazla deneme. Lütfen 15 dakika sonra tekrar deneyin.' }, 429);
    }

    const body = await c.req.json<SetPasswordBody>();
    const { token, email, password } = body;

    if (!token || !email || !password) {
      return c.json(new ValidationError('token, email ve password zorunludur.').toJSON(), 400);
    }

    if (password.length < 8) {
      return c.json(new ValidationError('Şifre en az 8 karakter olmalıdır.').toJSON(), 400);
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Genel hata mesajı — kullanıcı varlığını sızdırma
    const genericError = new ValidationError('Geçersiz veya süresi dolmuş token.').toJSON();

    if (!user) {
      logger.warn(`[SetPassword] Geçersiz email: ${email}`);
      return c.json(genericError, 400);
    }

    if (!tokensMatch(user.passwordResetToken, token)) {
      logger.warn(`[SetPassword] Geçersiz token: ${email}`);
      return c.json(genericError, 400);
    }

    if (!user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
      logger.warn(`[SetPassword] Süresi dolmuş token: ${email}`);
      return c.json(genericError, 400);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });

    logger.info(`[SetPassword] Şifre güncellendi: ${email}`);
    return c.json({ data: { success: true, message: 'Şifreniz başarıyla belirlendi.' } });
  }

  /**
   * POST /public/set-password/validate
   * Token geçerliliğini kontrol et.
   */
  static async validateToken(c: Context) {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    if (await rateLimiter.check(`validate-token:${ip}`, RATE_LIMIT, RATE_WINDOW)) {
      return c.json({ error: 'Çok fazla deneme. Lütfen 15 dakika sonra tekrar deneyin.' }, 429);
    }

    const body = await c.req.json<ValidateTokenBody>();
    const { token, email } = body;

    if (!token || !email) {
      return c.json(new ValidationError('token ve email zorunludur.').toJSON(), 400);
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    const genericError = { valid: false, error: 'Geçersiz veya süresi dolmuş token.' };

    if (!user || !tokensMatch(user.passwordResetToken, token)) {
      return c.json(genericError, 400);
    }

    if (!user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
      return c.json(genericError, 400);
    }

    return c.json({ data: { valid: true, name: user.name } });
  }
}
