import { resend, DEFAULT_FROM } from '../lib/resend';
import { logger } from '../lib/logger';
import { normalizeMailAttachments } from '../utils/mail-attachments';
import type { MailAttachmentInput } from '../utils/mail-attachments';
import type { CreateEmailOptions } from 'resend';

// ── Tipler ───────────────────────────────────
export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: MailAttachmentInput[];
}

export interface MailResult {
  success: boolean;
  id?: string;
  error?: string;
}

function toAddressArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

export function buildResendEmailPayload(options: SendMailOptions): CreateEmailOptions {
  const attachments = normalizeMailAttachments(options.attachments);

  return {
    from: options.from || DEFAULT_FROM,
    to: toAddressArray(options.to),
    subject: options.subject,
    html: options.html,
    ...(options.replyTo && { replyTo: options.replyTo }),
    ...(options.cc && { cc: toAddressArray(options.cc) }),
    ...(options.bcc && { bcc: toAddressArray(options.bcc) }),
    ...(attachments.length > 0 && {
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    }),
  };
}

// ── Genel mail gönderme ──────────────────────
export async function sendMail(options: SendMailOptions): Promise<MailResult> {
  if (process.env.MOCK_MAIL === 'true') {
    logger.info(`[MOCK MAIL] Gönderilen Mail:
      Kime: ${Array.isArray(options.to) ? options.to.join(', ') : options.to}
      Konu: ${options.subject}
      İçerik (HTML): ${options.html.substring(0, 500)}${options.html.length > 500 ? '...' : ''}`);
    return { success: true, id: `mock-email-id-${Date.now()}` };
  }

  if (!resend) {
    logger.warn('Resend yapılandırılmamış – mail gönderilmedi.');
    return { success: false, error: 'RESEND_API_KEY tanımlı değil' };
  }

  try {
    const payload = buildResendEmailPayload(options);
    const { data, error } = await resend.emails.send(payload);

    if (error) {
      logger.error(`Mail gönderim hatası: ${JSON.stringify(error)}`);
      return { success: false, error: error.message };
    }

    logger.info(`Mail gönderildi → ${options.to} (id: ${data?.id}, ek: ${options.attachments?.length ?? 0})`);
    return { success: true, id: data?.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Mail gönderim exception: ${message}`);
    return { success: false, error: message };
  }
}
