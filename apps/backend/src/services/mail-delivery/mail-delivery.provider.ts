import { z } from 'zod';
import { DEFAULT_FROM } from '../../lib/resend.js';
import { observedFetch } from '../../modules/shared/index.js';
import { ProviderHttpError, parseRetryAfter } from '../../infrastructure/providers/retry-policy.js';
import type { SendMailOptions } from '../mail.service.js';
import { normalizeMailAttachments } from '../../utils/mail-attachments.js';

export const mailDeliveryPayloadSchema = z.object({
  from: z.string(), to: z.array(z.string()), subject: z.string(), html: z.string(),
  reply_to: z.string().optional(), cc: z.array(z.string()).optional(), bcc: z.array(z.string()).optional(),
  attachments: z.array(z.object({ filename: z.string(), content: z.string(), content_type: z.string() })).optional(),
});
export type MailDeliveryPayload = z.infer<typeof mailDeliveryPayloadSchema>;

export function mailDeliveryPayload(options: SendMailOptions): MailDeliveryPayload {
  const addresses = (value: string | string[]) => Array.isArray(value) ? value : [value];
  const attachments = normalizeMailAttachments(options.attachments);
  return {
    from: options.from ?? DEFAULT_FROM, to: addresses(options.to), subject: options.subject, html: options.html,
    ...(options.replyTo ? { reply_to: options.replyTo } : {}),
    ...(options.cc ? { cc: addresses(options.cc) } : {}), ...(options.bcc ? { bcc: addresses(options.bcc) } : {}),
    ...(attachments.length ? { attachments: attachments.map((item) => ({ filename: item.filename, content: item.content, content_type: item.contentType })) } : {})
  };
}

function providerOrigin(): string {
  const local = process.env.NODE_ENV === 'test' ? process.env.MAIL_TEST_PROVIDER_ORIGIN : undefined;
  if (!local) return 'https://api.resend.com';
  const url = new URL(local);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Mail test provider must use a local HTTP origin.');
  }
  return url.origin;
}

/** One bounded attempt. Durable retry scheduling belongs to the outbox. */
export async function deliverMail(payload: MailDeliveryPayload, idempotencyKey: string): Promise<string> {
  if (process.env.MOCK_MAIL === 'true') return `mock-${idempotencyKey}`;
  if (!process.env.RESEND_API_KEY) throw new ProviderHttpError('Mail provider is not configured.', 400);
  const timeout = process.env.NODE_ENV === 'test' ? Number(process.env.MAIL_TEST_TIMEOUT_MS ?? 15_000) : 15_000;
  try {
    const response = await observedFetch(`${providerOrigin()}/emails`, {
      method: 'POST', signal: AbortSignal.timeout(timeout),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorBody: unknown = await response.json().catch(() => undefined);
      const parsed = z.object({ name: z.string().max(100) }).safeParse(errorBody);
      const code = parsed.success ? parsed.data.name : undefined;
      throw new ProviderHttpError(`Mail provider HTTP ${response.status}${code ? ` (${code})` : ''}.`, response.status, parseRetryAfter(response.headers.get('Retry-After')), code);
    }
    const result: unknown = await response.json();
    return z.object({ id: z.string().min(1) }).parse(result).id;
  } catch (error) {
    if (error instanceof ProviderHttpError) throw error;
    throw new ProviderHttpError(error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name) ? 'Mail provider timed out.' : 'Mail provider connection or response failed.', 0);
  }
}
