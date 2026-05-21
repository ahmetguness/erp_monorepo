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

export const MailTemplateVariableKeySchema = z.enum([
  'customerName',
  'invoiceNo',
  'dueDate',
  'amount',
  'employeeName',
  'quoteNo',
  'serviceNo',
]);

export const MailTemplateIdSchema = z.enum([
  'quote_followup',
  'payment_reminder',
  'employee_document',
  'service_update',
  'bulk_announcement',
]);

export const MailDraftToneSchema = z.enum(['formal', 'friendly', 'short']);

const MailTemplateVariableDefinitionSchema = z.object({
  key: MailTemplateVariableKeySchema,
  label: z.string(),
  required: z.boolean(),
  example: z.string(),
});

const MailTemplateSchema = z.object({
  id: MailTemplateIdSchema,
  name: z.string(),
  category: z.string(),
  description: z.string(),
  subject: z.string(),
  body: z.string(),
  variables: z.array(MailTemplateVariableDefinitionSchema),
});

const RenderedMailTemplateSchema = z.object({
  templateId: MailTemplateIdSchema,
  subject: z.string(),
  body: z.string(),
  missingVariables: z.array(MailTemplateVariableKeySchema),
});

const AiMailDraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
  usedAi: z.boolean(),
});

export type MailDirection = 'INBOUND' | 'OUTBOUND';
export type MailDeliveryStatus = 'PENDING' | 'SENT' | 'FAILED';
export type MailMessageListItem = z.infer<typeof MailMessageListItemSchema>;
export type MailMessageDetail = z.infer<typeof MailMessageDetailSchema>;
export type MailAttachmentMeta = z.infer<typeof MailAttachmentMetaSchema>;
export type BulkMailResult = z.infer<typeof BulkMailResultSchema>;
export type MailTemplateVariableKey = z.infer<typeof MailTemplateVariableKeySchema>;
export type MailTemplateId = z.infer<typeof MailTemplateIdSchema>;
export type MailDraftTone = z.infer<typeof MailDraftToneSchema>;
export type MailTemplateVariableDefinition = z.infer<typeof MailTemplateVariableDefinitionSchema>;
export type MailTemplate = z.infer<typeof MailTemplateSchema>;
export type RenderedMailTemplate = z.infer<typeof RenderedMailTemplateSchema>;
export type AiMailDraft = z.infer<typeof AiMailDraftSchema>;
export type MailTemplateVariables = Partial<Record<MailTemplateVariableKey, string>>;
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

export interface RenderMailTemplateDTO {
  templateId: MailTemplateId;
  variables: MailTemplateVariables;
}

export interface CreateAiMailDraftDTO extends RenderMailTemplateDTO {
  tone: MailDraftTone;
  audience?: string;
  notes?: string;
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

export async function listMailTemplates(): Promise<MailTemplate[]> {
  const res = await apiClient.get('/api/mail/templates');
  return safeParse(SingleResponseSchema(z.array(MailTemplateSchema)), res.data, 'listMailTemplates').data;
}

export async function renderMailTemplate(data: RenderMailTemplateDTO): Promise<RenderedMailTemplate> {
  const res = await apiClient.post('/api/mail/templates/render', data);
  return safeParse(SingleResponseSchema(RenderedMailTemplateSchema), res.data, 'renderMailTemplate').data;
}

export async function createAiMailDraft(data: CreateAiMailDraftDTO): Promise<AiMailDraft> {
  const res = await apiClient.post('/api/mail/ai-draft', data);
  return safeParse(SingleResponseSchema(AiMailDraftSchema), res.data, 'createAiMailDraft').data;
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
