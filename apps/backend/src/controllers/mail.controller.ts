import { Context } from 'hono';
import { MailDeliveryStatus, MailDirection } from '@prisma/client';
import { sendMail } from '../services/mail.service';
import { MailHistoryService } from '../services/mail-history.service';
import {
  welcomeEmail,
  passwordResetEmail,
  invoiceNotificationEmail,
  genericNotificationEmail,
} from '../services/mail-templates.service';
import { requireTenantId, requireUserId } from '../utils/context.js';
import {
  MailAttachmentInput,
  normalizeMailAttachments,
  validateNormalizedMailAttachments,
} from '../utils/mail-attachments';
import { prisma } from '../lib/prisma';
import { openai } from '../lib/openai';
import { BusinessRulesService } from '../services/business-rules.service.js';
import {
  createFallbackMailDraft,
  getMailTemplates,
  isMailTemplateId,
  isMailTemplateVariableKey,
  MailDraftTone,
  MailTemplateId,
  MailTemplateVariables,
  renderMailTemplate,
} from '../services/mail-template-library.service';

// ── Rate limiter (tenant bazlı, saatte max 20 mail) ─────
const mailRateMap = new Map<string, { count: number; resetAt: number }>();
const MAIL_RATE_LIMIT = 20;
const MAIL_RATE_WINDOW = 60 * 60 * 1000; // 1 saat
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const businessRulesService = new BusinessRulesService(prisma);

type AddressInput = string | string[] | undefined;

interface SendMailBody {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: MailAttachmentInput[];
}

interface BulkMailBody {
  recipients: string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  attachments?: MailAttachmentInput[];
}

interface AiDraftResult {
  subject: string;
  body: string;
  usedAi: boolean;
}

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

function validateAddressList(label: string, recipients: string[], required = false, maxRecipients = 10): string | null {
  if (required && recipients.length === 0) return `${label} icin gecerli bir e-posta adresi gereklidir.`;
  if (recipients.length > maxRecipients) return `${label} alaninda en fazla ${maxRecipients} alici olabilir.`;

  const invalid = recipients.find((recipient) => !isValidMailAddress(recipient));
  if (invalid) return `${label} alaninda gecersiz e-posta adresi var: ${invalid}`;

  return null;
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, parsed));
}

function parseMailDirection(value: string | undefined): MailDirection | undefined {
  if (!value) return undefined;
  return value === MailDirection.INBOUND || value === MailDirection.OUTBOUND ? value : undefined;
}

function parseMailStatus(value: string | undefined): MailDeliveryStatus | undefined {
  if (!value) return undefined;
  if (value === MailDeliveryStatus.PENDING) return value;
  if (value === MailDeliveryStatus.SENT) return value;
  if (value === MailDeliveryStatus.FAILED) return value;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStringField(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function parseTemplateId(value: unknown): MailTemplateId | null {
  if (typeof value !== 'string' || !isMailTemplateId(value)) return null;
  return value;
}

function parseTone(value: unknown): MailDraftTone {
  if (value === 'friendly' || value === 'short' || value === 'formal') return value;
  return 'formal';
}

function parseTemplateVariables(value: unknown): MailTemplateVariables {
  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<MailTemplateVariables>((acc, [key, rawValue]) => {
    if (!isMailTemplateVariableKey(key) || typeof rawValue !== 'string') return acc;
    const trimmed = rawValue.trim();
    if (trimmed) acc[key] = trimmed.slice(0, 300);
    return acc;
  }, {});
}

function parseAiDraftContent(content: string | null, fallback: AiDraftResult): AiDraftResult {
  if (!content) return fallback;
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)) return fallback;
    const subject = parseStringField(parsed.subject, 200);
    const body = parseStringField(parsed.body, 5000);
    if (!subject || !body) return fallback;
    return { subject, body, usedAi: true };
  } catch {
    return fallback;
  }
}

async function withDefaultSignature(tenantId: string, html: string): Promise<string> {
  const signature = (await businessRulesService.getString(tenantId, 'mail.default_signature')).trim();
  if (!signature || html.includes(signature)) return html;
  return `${html}<br><br>${signature}`;
}

async function sendAndRecordMail(options: {
  tenantId: string;
  userId?: string;
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: ReturnType<typeof normalizeMailAttachments>;
}) {
  const recipients = normalizeAddresses(options.to);
  const history = await MailHistoryService.createOutbound({
    tenantId: options.tenantId,
    sentById: options.userId,
    from: options.from,
    replyTo: options.replyTo,
    to: recipients,
    cc: options.cc,
    bcc: options.bcc,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments,
  });

  const result = await sendMail({
    to: recipients,
    subject: options.subject,
    html: options.html,
    ...(options.from && { from: options.from }),
    ...(options.replyTo && { replyTo: options.replyTo }),
    ...(options.cc && options.cc.length > 0 && { cc: options.cc }),
    ...(options.bcc && options.bcc.length > 0 && { bcc: options.bcc }),
    ...(options.attachments && options.attachments.length > 0 && { attachments: options.attachments }),
  });

  await MailHistoryService.complete({
    id: history.id,
    tenantId: options.tenantId,
    success: result.success,
    providerId: result.id,
    error: result.error,
  });

  return result;
}

export class MailController {
  /** GET /api/mail/templates - Tenant baglamli mail sablon kutuphanesi */
  static async templates(c: Context) {
    requireTenantId(c);
    return c.json({ data: getMailTemplates() });
  }

  /** POST /api/mail/templates/render - Sablonu degiskenlerle doldur */
  static async renderTemplate(c: Context) {
    requireTenantId(c);
    const body: unknown = await c.req.json();
    if (!isRecord(body)) return c.json({ error: 'Gecersiz istek govdesi.' }, 400);

    const templateId = parseTemplateId(body.templateId);
    if (!templateId) return c.json({ error: 'Gecerli bir sablon secilmelidir.' }, 400);

    const rendered = renderMailTemplate(templateId, parseTemplateVariables(body.variables));
    if (!rendered) return c.json({ error: 'Sablon bulunamadi.' }, 404);
    return c.json({ data: rendered });
  }

  /** POST /api/mail/ai-draft - Secili baglama gore mail taslagi uret */
  static async aiDraft(c: Context) {
    requireTenantId(c);
    requireUserId(c);
    const body: unknown = await c.req.json();
    if (!isRecord(body)) return c.json({ error: 'Gecersiz istek govdesi.' }, 400);

    const templateId = parseTemplateId(body.templateId);
    if (!templateId) return c.json({ error: 'AI taslak icin gecerli bir baglam secilmelidir.' }, 400);

    const variables = parseTemplateVariables(body.variables);
    const notes = parseStringField(body.notes, 1000);
    const audience = parseStringField(body.audience, 300);
    const tone = parseTone(body.tone);
    const fallback = createFallbackMailDraft({ templateId, variables, notes });
    if (!fallback) return c.json({ error: 'Sablon bulunamadi.' }, 404);

    const fallbackDraft: AiDraftResult = {
      subject: fallback.subject,
      body: fallback.body,
      usedAi: false,
    };

    if (!process.env.OPENAI_API_KEY) {
      return c.json({ data: fallbackDraft });
    }

    const template = getMailTemplates().find((item) => item.id === templateId);
    const variableLines = Object.entries(variables)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'ERP mail taslagi hazirlayan yardimcisin. Sadece verilen tenant baglami, sablon ve kullanici notlarini kullan. Yeni finansal veri uydurma. JSON olarak subject ve body don.',
          },
          {
            role: 'user',
            content: [
              'Tenant baglami backend tarafinda dogrulandi.',
              `Sablon: ${template?.name ?? templateId}`,
              `Ton: ${tone}`,
              audience ? `Hedef kitle: ${audience}` : undefined,
              variableLines ? `Degiskenler:\n${variableLines}` : undefined,
              notes ? `Kullanici notu: ${notes}` : undefined,
              `Taslak konu: ${fallback.subject}`,
              `Taslak metin:\n${fallback.body}`,
              'Cevap dili Turkce olsun. Kisa, net, profesyonel ve gondermeden once kullanicinin duzenleyebilecegi metin yaz.',
            ]
              .filter((line): line is string => Boolean(line))
              .join('\n\n'),
          },
        ],
        temperature: 0.3,
        max_tokens: 700,
      });

      const draft = parseAiDraftContent(completion.choices[0]?.message.content ?? null, fallbackDraft);
      return c.json({ data: draft });
    } catch {
      return c.json({ data: fallbackDraft });
    }
  }

  /** GET /api/mail – Tenant mail geçmişi */
  static async list(c: Context) {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const page = parsePositiveInt(c.req.query('page'), 1, 10_000);
    const limit = parsePositiveInt(c.req.query('limit'), 20, 100);

    const result = await MailHistoryService.list({
      tenantId,
      userId,
      page,
      limit,
      direction: parseMailDirection(c.req.query('direction')),
      status: parseMailStatus(c.req.query('status')),
      search: c.req.query('search')?.trim() || undefined,
    });

    return c.json(result);
  }

  /** GET /api/mail/:id – Mail detay */
  static async get(c: Context) {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'Mail kaydı bulunamadı.' }, 404);
    const mail = await MailHistoryService.get(tenantId, userId, id);
    if (!mail) return c.json({ error: 'Mail kaydı bulunamadı.' }, 404);
    return c.json({ data: mail });
  }

  /** POST /api/mail/send – Serbest formatlı mail gönder */
  static async send(c: Context) {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const { to, subject, html, from, replyTo, cc, bcc, attachments } = await c.req.json<SendMailBody>();

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

    if (attachments !== undefined && !Array.isArray(attachments)) {
      return c.json({ error: 'Dosya ekleri gecersiz.' }, 400);
    }

    const normalizedAttachments = normalizeMailAttachments(attachments);
    const attachmentError = validateNormalizedMailAttachments(normalizedAttachments, {
      maxAttachments: MAX_ATTACHMENTS,
      maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
      maxTotalAttachmentBytes: MAX_TOTAL_ATTACHMENT_BYTES,
    });
    if (attachmentError) return c.json({ error: attachmentError }, 400);

    const htmlWithSignature = await withDefaultSignature(tenantId, html);
    if (htmlWithSignature.length > 50000) {
      return c.json({ error: 'Mail içeriği çok uzun (max 50KB).' }, 400);
    }

    const result = await sendAndRecordMail({
      tenantId,
      userId,
      from: from?.trim() || undefined,
      replyTo: replyTo?.trim() || undefined,
      to: recipients,
      cc: ccRecipients,
      bcc: bccRecipients,
      subject,
      html: htmlWithSignature,
      attachments: normalizedAttachments,
    });
    return c.json(result, result.success ? 200 : 500);
  }

  /** POST /api/mail/bulk – Aynı içeriği birden fazla adrese tek tek gönder */
  static async bulk(c: Context) {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const { recipients: rawRecipients, subject, html, from, replyTo, attachments } = await c.req.json<BulkMailBody>();

    if (!rawRecipients || !subject || !html) {
      return c.json({ error: 'recipients, subject ve html alanları zorunludur.' }, 400);
    }

    if (!checkMailRateLimit(tenantId)) {
      return c.json({ error: 'Mail gönderim limiti aşıldı. Saatte en fazla 20 mail gönderilebilir.' }, 429);
    }

    const recipients = normalizeAddresses(rawRecipients);
    if (recipients.length === 0) return c.json({ error: 'En az bir alıcı gereklidir.' }, 400);
    if (recipients.length > 50) return c.json({ error: 'Toplu gönderimde en fazla 50 alıcı olabilir.' }, 400);

    const recipientError = validateAddressList('Alıcılar', recipients, true, 50);
    if (recipientError) return c.json({ error: recipientError }, 400);

    if (replyTo?.trim() && !isValidMailAddress(replyTo.trim())) {
      return c.json({ error: 'Reply-To alaninda gecersiz e-posta adresi var.' }, 400);
    }

    if (from?.trim() && !isValidMailAddress(from.trim())) {
      return c.json({ error: 'From alaninda gecersiz e-posta adresi var.' }, 400);
    }

    if (attachments !== undefined && !Array.isArray(attachments)) {
      return c.json({ error: 'Dosya ekleri gecersiz.' }, 400);
    }

    const normalizedAttachments = normalizeMailAttachments(attachments);
    const attachmentError = validateNormalizedMailAttachments(normalizedAttachments, {
      maxAttachments: MAX_ATTACHMENTS,
      maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
      maxTotalAttachmentBytes: MAX_TOTAL_ATTACHMENT_BYTES,
    });
    if (attachmentError) return c.json({ error: attachmentError }, 400);

    const htmlWithSignature = await withDefaultSignature(tenantId, html);
    if (htmlWithSignature.length > 50000) {
      return c.json({ error: 'Mail içeriği çok uzun (max 50KB).' }, 400);
    }

    const results = [];
    for (const recipient of recipients) {
      const result = await sendAndRecordMail({
        tenantId,
        userId,
        from: from?.trim() || undefined,
        replyTo: replyTo?.trim() || undefined,
        to: [recipient],
        subject,
        html: htmlWithSignature,
        attachments: normalizedAttachments,
      });

      results.push({ to: recipient, success: result.success, id: result.id, error: result.error });
    }

    const successCount = results.filter((result) => result.success).length;
    return c.json({
      success: successCount === results.length,
      sent: successCount,
      failed: results.length - successCount,
      results,
    }, successCount === results.length ? 200 : 207);
  }

  /** POST /api/mail/welcome – Hoş geldin maili */
  static async sendWelcome(c: Context) {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const { to, name } = await c.req.json<{ to: string; name: string }>();
    if (!to || !name) return c.json({ error: 'to ve name alanları zorunludur.' }, 400);
    if (!checkMailRateLimit(tenantId)) return c.json({ error: 'Mail gönderim limiti aşıldı.' }, 429);

    const template = welcomeEmail(name);
    const result = await sendAndRecordMail({ tenantId, userId, to, ...template });
    return c.json(result, result.success ? 200 : 500);
  }

  /** POST /api/mail/password-reset – Şifre sıfırlama maili */
  static async sendPasswordReset(c: Context) {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const { to, name, resetUrl } = await c.req.json<{ to: string; name: string; resetUrl: string }>();
    if (!to || !name || !resetUrl) return c.json({ error: 'to, name ve resetUrl alanları zorunludur.' }, 400);
    if (!checkMailRateLimit(tenantId)) return c.json({ error: 'Mail gönderim limiti aşıldı.' }, 429);

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    if (!resetUrl.startsWith(appUrl)) {
      return c.json({ error: 'Geçersiz resetUrl.' }, 400);
    }

    const template = passwordResetEmail(name, resetUrl);
    const result = await sendAndRecordMail({ tenantId, userId, to, ...template });
    return c.json(result, result.success ? 200 : 500);
  }

  /** POST /api/mail/invoice-notification – Fatura bildirimi */
  static async sendInvoiceNotification(c: Context) {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const { to, name, invoiceNo, amount } = await c.req.json<{
      to: string; name: string; invoiceNo: string; amount: number;
    }>();
    if (!to || !name || !invoiceNo || !amount) return c.json({ error: 'to, name, invoiceNo ve amount alanları zorunludur.' }, 400);
    if (!checkMailRateLimit(tenantId)) return c.json({ error: 'Mail gönderim limiti aşıldı.' }, 429);

    const template = invoiceNotificationEmail(name, invoiceNo, String(amount));
    const result = await sendAndRecordMail({ tenantId, userId, to, ...template });
    return c.json(result, result.success ? 200 : 500);
  }

  /** POST /api/mail/notification – Genel bildirim maili */
  static async sendNotification(c: Context) {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const { to, title, message } = await c.req.json<{ to: string; title: string; message: string }>();
    if (!to || !title || !message) return c.json({ error: 'to, title ve message alanları zorunludur.' }, 400);
    if (!checkMailRateLimit(tenantId)) return c.json({ error: 'Mail gönderim limiti aşıldı.' }, 429);

    const template = genericNotificationEmail(title, message);
    const result = await sendAndRecordMail({ tenantId, userId, to, ...template });
    return c.json(result, result.success ? 200 : 500);
  }
}
