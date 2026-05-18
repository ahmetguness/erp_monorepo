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
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024;

interface MailAttachmentInput {
  filename: string;
  content: string;
  contentType?: string;
}

type AddressInput = string | string[] | undefined;

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

function normalizeAddresses(value: AddressInput): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : value.split(','))
    .map((item) => item.trim())
    .filter(Boolean);
}

function isValidMailAddress(value: string): boolean {
  const emailOnly = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  const namedEmail = /^.{1,100}\s<[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>$/;
  return emailOnly.test(value) || namedEmail.test(value);
}

function validateAddressList(label: string, recipients: string[], required = false): string | null {
  if (required && recipients.length === 0) return `${label} icin gecerli bir e-posta adresi gereklidir.`;
  if (recipients.length > 10) return `${label} alaninda en fazla 10 alici olabilir.`;

  const invalid = recipients.find((recipient) => !isValidMailAddress(recipient));
  if (invalid) return `${label} alaninda gecersiz e-posta adresi var: ${invalid}`;

  return null;
}

function estimateBase64Bytes(content: string): number {
  const normalized = content.replace(/\s/g, '');
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function normalizeAttachmentContent(content: string): string {
  const trimmed = content.trim();
  const dataUrlSeparator = trimmed.indexOf(',');
  const withoutPrefix = trimmed.startsWith('data:') && dataUrlSeparator >= 0
    ? trimmed.slice(dataUrlSeparator + 1)
    : trimmed;
  return withoutPrefix.replace(/\s/g, '');
}

function normalizeAttachments(attachments?: MailAttachmentInput[]): MailAttachmentInput[] {
  if (!attachments) return [];
  return attachments.map((attachment) => ({
    filename: attachment.filename.trim(),
    content: normalizeAttachmentContent(attachment.content),
    ...(attachment.contentType?.trim() && { contentType: attachment.contentType.trim() }),
  }));
}

function validateAttachments(attachments?: MailAttachmentInput[]): string | null {
  if (!attachments || attachments.length === 0) return null;
  if (!Array.isArray(attachments)) return 'Dosya ekleri geçersiz.';
  if (attachments.length > MAX_ATTACHMENTS) return `En fazla ${MAX_ATTACHMENTS} dosya eklenebilir.`;

  let totalBytes = 0;
  for (const attachment of attachments) {
    if (!attachment.filename?.trim() || !attachment.content?.trim()) {
      return 'Her dosya eki için dosya adı ve içerik zorunludur.';
    }

    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.content)) {
      return `${attachment.filename} dosyasi base64 formatinda degil.`;
    }

    const size = estimateBase64Bytes(attachment.content);
    if (size > MAX_ATTACHMENT_BYTES) return `${attachment.filename} dosyası 5 MB sınırını aşıyor.`;
    totalBytes += size;
  }

  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) return 'Toplam dosya eki boyutu 10 MB sınırını aşıyor.';
  return null;
}

export class MailController {
  /** POST /api/mail/send – Serbest formatlı mail gönder */
  static async send(c: Context) {
    const tenantId = requireTenantId(c);
    const { to, subject, html, from, replyTo, cc, bcc, attachments } = await c.req.json<{
      to: string | string[];
      subject: string;
      html: string;
      from?: string;
      replyTo?: string;
      cc?: string | string[];
      bcc?: string | string[];
      attachments?: MailAttachmentInput[];
    }>();

    if (!to || !subject || !html) {
      return c.json({ error: 'to, subject ve html alanları zorunludur.' }, 400);
    }

    if (!checkMailRateLimit(tenantId)) {
      return c.json({ error: 'Mail gönderim limiti aşıldı. Saatte en fazla 20 mail gönderilebilir.' }, 429);
    }

    const recipients = normalizeAddresses(to);
    const ccRecipients = normalizeAddresses(cc);
    const bccRecipients = normalizeAddresses(bcc);

    const recipientError =
      validateAddressList('Kime', recipients, true) ??
      validateAddressList('Cc', ccRecipients) ??
      validateAddressList('Bcc', bccRecipients);
    if (recipientError) return c.json({ error: recipientError }, 400);

    if (replyTo?.trim() && !isValidMailAddress(replyTo.trim())) {
      return c.json({ error: 'Reply-To alaninda gecersiz e-posta adresi var.' }, 400);
    }

    if (from?.trim() && !isValidMailAddress(from.trim())) {
      return c.json({ error: 'From alaninda gecersiz e-posta adresi var.' }, 400);
    }

    const normalizedAttachments = normalizeAttachments(attachments);
    const attachmentError = validateAttachments(normalizedAttachments);
    if (attachmentError) return c.json({ error: attachmentError }, 400);

    if (typeof html === 'string' && html.length > 50000) {
      return c.json({ error: 'Mail içeriği çok uzun (max 50KB).' }, 400);
    }

    const result = await sendMail({
      to: recipients,
      subject,
      html,
      ...(from?.trim() && { from: from.trim() }),
      ...(replyTo?.trim() && { replyTo: replyTo.trim() }),
      ...(ccRecipients.length > 0 && { cc: ccRecipients }),
      ...(bccRecipients.length > 0 && { bcc: bccRecipients }),
      ...(normalizedAttachments.length > 0 && { attachments: normalizedAttachments }),
    });
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
