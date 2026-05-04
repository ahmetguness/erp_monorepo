import { Context } from 'hono';
import { sendMail } from '../services/mail.service';
import {
  welcomeEmail,
  passwordResetEmail,
  invoiceNotificationEmail,
  genericNotificationEmail,
} from '../services/mail-templates.service';
import { requireTenantId } from '../utils/context.js';

// ── Rate limiter (tenant bazlı, saatte max 20 mail) ─────
const mailRateMap = new Map<string, { count: number; resetAt: number }>();
const MAIL_RATE_LIMIT = 20;
const MAIL_RATE_WINDOW = 60 * 60 * 1000; // 1 saat

function checkMailRateLimit(tenantId: string): boolean {
  const now = Date.now();
  const entry = mailRateMap.get(tenantId);
  if (!entry || now > entry.resetAt) {
    mailRateMap.set(tenantId, { count: 1, resetAt: now + MAIL_RATE_WINDOW });
    return true;
  }
  if (entry.count >= MAIL_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ── Alıcı validasyonu ────────────────────────────────────
function validateRecipient(to: string | string[]): string | null {
  const recipients = Array.isArray(to) ? to : [to];
  if (recipients.length === 0 || recipients.some((e) => !e)) {
    return 'Geçerli bir alıcı adresi gereklidir.';
  }
  if (recipients.length > 10) {
    return 'Tek seferde en fazla 10 alıcıya mail gönderilebilir.';
  }
  return null;
}

export class MailController {
  /** POST /api/mail/send – Serbest formatlı mail gönder */
  static async send(c: Context) {
    const tenantId = requireTenantId(c);
    const { to, subject, html, replyTo, cc, bcc } = await c.req.json<{
      to: string | string[];
      subject: string;
      html: string;
      replyTo?: string;
      cc?: string | string[];
      bcc?: string | string[];
    }>();

    if (!to || !subject || !html) {
      return c.json({ error: 'to, subject ve html alanları zorunludur.' }, 400);
    }

    if (!checkMailRateLimit(tenantId)) {
      return c.json({ error: 'Mail gönderim limiti aşıldı. Saatte en fazla 20 mail gönderilebilir.' }, 429);
    }

    const recipientError = validateRecipient(to);
    if (recipientError) return c.json({ error: recipientError }, 400);

    if (typeof html === 'string' && html.length > 50000) {
      return c.json({ error: 'Mail içeriği çok uzun (max 50KB).' }, 400);
    }

    const result = await sendMail({ to, subject, html, replyTo, cc, bcc });
    return c.json(result, result.success ? 200 : 500);
  }

  /** POST /api/mail/welcome – Hoş geldin maili */
  static async sendWelcome(c: Context) {
    const tenantId = requireTenantId(c);
    const { to, name } = await c.req.json<{ to: string; name: string }>();
    if (!to || !name) return c.json({ error: 'to ve name alanları zorunludur.' }, 400);
    if (!checkMailRateLimit(tenantId)) return c.json({ error: 'Mail gönderim limiti aşıldı.' }, 429);

    const template = welcomeEmail(name);
    const result = await sendMail({ to, ...template });
    return c.json(result, result.success ? 200 : 500);
  }

  /** POST /api/mail/password-reset – Şifre sıfırlama maili */
  static async sendPasswordReset(c: Context) {
    const tenantId = requireTenantId(c);
    const { to, name, resetUrl } = await c.req.json<{ to: string; name: string; resetUrl: string }>();
    if (!to || !name || !resetUrl) return c.json({ error: 'to, name ve resetUrl alanları zorunludur.' }, 400);
    if (!checkMailRateLimit(tenantId)) return c.json({ error: 'Mail gönderim limiti aşıldı.' }, 429);

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    if (!resetUrl.startsWith(appUrl)) {
      return c.json({ error: 'Geçersiz resetUrl.' }, 400);
    }

    const template = passwordResetEmail(name, resetUrl);
    const result = await sendMail({ to, ...template });
    return c.json(result, result.success ? 200 : 500);
  }

  /** POST /api/mail/invoice-notification – Fatura bildirimi */
  static async sendInvoiceNotification(c: Context) {
    const tenantId = requireTenantId(c);
    const { to, name, invoiceNo, amount } = await c.req.json<{
      to: string; name: string; invoiceNo: string; amount: number;
    }>();
    if (!to || !name || !invoiceNo || !amount) return c.json({ error: 'to, name, invoiceNo ve amount alanları zorunludur.' }, 400);
    if (!checkMailRateLimit(tenantId)) return c.json({ error: 'Mail gönderim limiti aşıldı.' }, 429);

    const template = invoiceNotificationEmail(name, invoiceNo, String(amount));
    const result = await sendMail({ to, ...template });
    return c.json(result, result.success ? 200 : 500);
  }

  /** POST /api/mail/notification – Genel bildirim maili */
  static async sendNotification(c: Context) {
    const tenantId = requireTenantId(c);
    const { to, title, message } = await c.req.json<{ to: string; title: string; message: string }>();
    if (!to || !title || !message) return c.json({ error: 'to, title ve message alanları zorunludur.' }, 400);
    if (!checkMailRateLimit(tenantId)) return c.json({ error: 'Mail gönderim limiti aşıldı.' }, 429);

    const template = genericNotificationEmail(title, message);
    const result = await sendMail({ to, ...template });
    return c.json(result, result.success ? 200 : 500);
  }
}
