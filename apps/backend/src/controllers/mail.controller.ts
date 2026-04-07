import { Context } from 'hono';
import { sendMail } from '../services/mail.service';
import {
  welcomeEmail,
  passwordResetEmail,
  invoiceNotificationEmail,
  genericNotificationEmail,
} from '../services/mail-templates.service';

export class MailController {
  /** POST /api/mail/send – Serbest formatlı mail gönder */
  static async send(c: Context) {
    const { to, subject, html, replyTo, cc, bcc } = await c.req.json();

    if (!to || !subject || !html) {
      return c.json({ error: 'to, subject ve html alanları zorunludur.' }, 400);
    }

    const result = await sendMail({ to, subject, html, replyTo, cc, bcc });
    return c.json(result, result.success ? 200 : 500);
  }

  /** POST /api/mail/welcome – Hoş geldin maili */
  static async sendWelcome(c: Context) {
    const { to, name } = await c.req.json();
    if (!to || !name) {
      return c.json({ error: 'to ve name alanları zorunludur.' }, 400);
    }

    const template = welcomeEmail(name);
    const result = await sendMail({ to, ...template });
    return c.json(result, result.success ? 200 : 500);
  }

  /** POST /api/mail/password-reset – Şifre sıfırlama maili */
  static async sendPasswordReset(c: Context) {
    const { to, name, resetUrl } = await c.req.json();
    if (!to || !name || !resetUrl) {
      return c.json({ error: 'to, name ve resetUrl alanları zorunludur.' }, 400);
    }

    const template = passwordResetEmail(name, resetUrl);
    const result = await sendMail({ to, ...template });
    return c.json(result, result.success ? 200 : 500);
  }

  /** POST /api/mail/invoice-notification – Fatura bildirimi */
  static async sendInvoiceNotification(c: Context) {
    const { to, name, invoiceNo, amount } = await c.req.json();
    if (!to || !name || !invoiceNo || !amount) {
      return c.json({ error: 'to, name, invoiceNo ve amount alanları zorunludur.' }, 400);
    }

    const template = invoiceNotificationEmail(name, invoiceNo, amount);
    const result = await sendMail({ to, ...template });
    return c.json(result, result.success ? 200 : 500);
  }

  /** POST /api/mail/notification – Genel bildirim maili */
  static async sendNotification(c: Context) {
    const { to, title, message } = await c.req.json();
    if (!to || !title || !message) {
      return c.json({ error: 'to, title ve message alanları zorunludur.' }, 400);
    }

    const template = genericNotificationEmail(title, message);
    const result = await sendMail({ to, ...template });
    return c.json(result, result.success ? 200 : 500);
  }
}
