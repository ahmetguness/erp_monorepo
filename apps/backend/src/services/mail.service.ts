import { resend, DEFAULT_FROM } from '../lib/resend';
import { logger } from '../lib/logger';

// ── Tipler ───────────────────────────────────
export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    content: string;
    contentType?: string;
  }>;
}

export interface MailResult {
  success: boolean;
  id?: string;
  error?: string;
}

function cleanBase64(content: string): string {
  const trimmed = content.trim();
  const dataUrlSeparator = trimmed.indexOf(',');
  const withoutPrefix = trimmed.startsWith('data:') && dataUrlSeparator >= 0
    ? trimmed.slice(dataUrlSeparator + 1)
    : trimmed;
  return withoutPrefix.replace(/\s/g, '');
}

// ── Genel mail gönderme ──────────────────────
export async function sendMail(options: SendMailOptions): Promise<MailResult> {
  if (!resend) {
    logger.warn('Resend yapılandırılmamış – mail gönderilmedi.');
    return { success: false, error: 'RESEND_API_KEY tanımlı değil' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: options.from || DEFAULT_FROM,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      ...(options.replyTo && { replyTo: options.replyTo }),
      ...(options.cc && { cc: Array.isArray(options.cc) ? options.cc : [options.cc] }),
      ...(options.bcc && { bcc: Array.isArray(options.bcc) ? options.bcc : [options.bcc] }),
      ...(options.attachments?.length && {
        attachments: options.attachments.map((attachment) => ({
          filename: attachment.filename,
          content: cleanBase64(attachment.content),
          ...(attachment.contentType && { contentType: attachment.contentType }),
        })),
      }),
    });

    if (error) {
      logger.error(`Mail gönderim hatası: ${JSON.stringify(error)}`);
      return { success: false, error: error.message };
    }

    logger.info(`Mail gönderildi → ${options.to} (id: ${data?.id})`);
    return { success: true, id: data?.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Mail gönderim exception: ${message}`);
    return { success: false, error: message };
  }
}
