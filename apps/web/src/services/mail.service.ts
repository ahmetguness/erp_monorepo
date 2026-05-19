import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { PaginatedResponseSchema, SingleResponseSchema } from '@/types/api.types';
import type { PaginationMeta } from '@/types/api.types';

export const MailResultSchema = z.object({
  success: z.boolean(),
  id: z.string().optional(),
  error: z.string().optional(),
});

export type MailResult = z.infer<typeof MailResultSchema>;

const MailAttachmentMetaSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
});

const MailSenderSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
}).nullable();

const MailMessageListItemSchema = z.object({
  id: z.string(),
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  status: z.enum(['PENDING', 'SENT', 'FAILED']),
  providerId: z.string().nullable(),
  from: z.string().nullable(),
  replyTo: z.string().nullable(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  bcc: z.array(z.string()),
  subject: z.string(),
  textPreview: z.string().nullable(),
  attachmentCount: z.number(),
  error: z.string().nullable(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
  sentBy: MailSenderSchema,
});

const MailMessageDetailSchema = MailMessageListItemSchema.extend({
  html: z.string(),
  attachments: z.array(MailAttachmentMetaSchema).nullable().catch(null),
});

const BulkMailResultSchema = z.object({
  success: z.boolean(),
  sent: z.number(),
  failed: z.number(),
  results: z.array(z.object({
    to: z.string(),
    success: z.boolean(),
    id: z.string().optional(),
    error: z.string().optional(),
  })),
});

export type MailDirection = 'INBOUND' | 'OUTBOUND';
export type MailDeliveryStatus = 'PENDING' | 'SENT' | 'FAILED';
export type MailMessageListItem = z.infer<typeof MailMessageListItemSchema>;
export type MailMessageDetail = z.infer<typeof MailMessageDetailSchema>;
export type MailAttachmentMeta = z.infer<typeof MailAttachmentMetaSchema>;
export type BulkMailResult = z.infer<typeof BulkMailResultSchema>;
export type MailListResponse = { data: MailMessageListItem[]; meta: PaginationMeta };

export interface ListMailParams {
  page?: number;
  limit?: number;
  direction?: MailDirection;
  status?: MailDeliveryStatus;
  search?: string;
}

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

export interface BulkMailDTO {
  recipients: string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
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

export async function listMail(params: ListMailParams = {}): Promise<MailListResponse> {
  const res = await apiClient.get('/api/mail', { params });
  return safeParse(PaginatedResponseSchema(MailMessageListItemSchema), res.data, 'listMail');
}

export async function getMail(id: string): Promise<MailMessageDetail> {
  const res = await apiClient.get(`/api/mail/${id}`);
  return safeParse(SingleResponseSchema(MailMessageDetailSchema), res.data, 'getMail').data;
}

export async function sendMail(data: SendMailDTO): Promise<MailResult> {
  const res = await apiClient.post('/api/mail/send', data);
  return safeParse(MailResultSchema, res.data, 'sendMail');
}

export async function sendBulkMail(data: BulkMailDTO): Promise<BulkMailResult> {
  const res = await apiClient.post('/api/mail/bulk', data);
  return safeParse(BulkMailResultSchema, res.data, 'sendBulkMail');
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
