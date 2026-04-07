import { Context } from 'hono';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

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

    if (!user) {
      return c.json({ error: 'Geçersiz token veya e-posta.' }, 400);
    }

    if (user.passwordResetToken !== token) {
      return c.json({ error: 'Geçersiz veya kullanılmış token.' }, 400);
    }

    if (user.passwordResetExpiry && user.passwordResetExpiry < new Date()) {
      return c.json({ error: 'Token süresi dolmuş. Lütfen yeni bir link talep edin.' }, 400);
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

    if (!user || user.passwordResetToken !== token) {
      return c.json({ valid: false, error: 'Geçersiz token.' }, 400);
    }

    if (user.passwordResetExpiry && user.passwordResetExpiry < new Date()) {
      return c.json({ valid: false, error: 'Token süresi dolmuş.' }, 400);
    }

    return c.json({ valid: true, name: user.name });
  }
}
