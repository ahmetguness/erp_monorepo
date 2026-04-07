import { Context } from 'hono';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';

/** Timing-safe token karşılaştırma (gelen raw token hash'lenerek DB'deki hash ile karşılaştırılır) */
function tokensMatch(storedHash: string | null, rawToken: string): boolean {
  if (!storedHash) return false;
  try {
    const incomingHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(incomingHash));
  } catch {
    return false;
  }
}

export class SetPasswordController {
  /**
   * POST /public/set-password
   * Token ile şifre belirleme (demo + password reset).
   */
  static async setPassword(c: Context) {
    const { token, email, password } = await c.req.json();

    if (!token || !email || !password) {
      return c.json({ error: 'token, email ve password zorunludur.' }, 400);
    }

    if (password.length < 8) {
      return c.json({ error: 'Şifre en az 8 karakter olmalıdır.' }, 400);
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Genel hata mesajı — kullanıcı varlığını sızdırma
    const genericError = { error: 'Geçersiz veya süresi dolmuş token.' };

    if (!user) {
      return c.json(genericError, 400);
    }

    if (!tokensMatch(user.passwordResetToken, token)) {
      return c.json(genericError, 400);
    }

    if (!user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
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

    return c.json({ success: true, message: 'Şifreniz başarıyla belirlendi. Giriş yapabilirsiniz.' });
  }

  /**
   * POST /public/set-password/validate
   * Token geçerliliğini kontrol et (frontend'de form göstermeden önce).
   */
  static async validateToken(c: Context) {
    const { token, email } = await c.req.json();

    if (!token || !email) {
      return c.json({ error: 'token ve email zorunludur.' }, 400);
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

    return c.json({ valid: true, name: user.name });
  }
}
