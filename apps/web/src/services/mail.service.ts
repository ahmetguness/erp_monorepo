import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';

export const MailResultSchema = z.object({
  success: z.boolean(),
  id: z.string().optional(),
  error: z.string().optional(),
});

export type MailResult = z.infer<typeof MailResultSchema>;

export interface SendMailDTO {
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

export interface WelcomeMailDTO { to: string; name: string }
export interface PasswordResetMailDTO { to: string; name: string; resetUrl: string }
export interface InvoiceNotificationMailDTO { to: string; name: string; invoiceNo: string; amount: number }
export interface GenericNotificationMailDTO { to: string; title: string; message: string }

export async function sendMail(data: SendMailDTO): Promise<MailResult> {
  const res = await apiClient.post('/api/mail/send', data);
  return safeParse(MailResultSchema, res.data, 'sendMail');
}

export async function sendWelcomeMail(data: WelcomeMailDTO): Promise<MailResult> {
  const res = await apiClient.post('/api/mail/welcome', data);
  return safeParse(MailResultSchema, res.data, 'sendWelcomeMail');
}

export async function sendPasswordResetMail(data: PasswordResetMailDTO): Promise<MailResult> {
  const res = await apiClient.post('/api/mail/password-reset', data);
  return safeParse(MailResultSchema, res.data, 'sendPasswordResetMail');
}

export async function sendInvoiceNotificationMail(data: InvoiceNotificationMailDTO): Promise<MailResult> {
  const res = await apiClient.post('/api/mail/invoice-notification', data);
  return safeParse(MailResultSchema, res.data, 'sendInvoiceNotificationMail');
}

export async function sendGenericNotificationMail(data: GenericNotificationMailDTO): Promise<MailResult> {
  const res = await apiClient.post('/api/mail/notification', data);
  return safeParse(MailResultSchema, res.data, 'sendGenericNotificationMail');
}
