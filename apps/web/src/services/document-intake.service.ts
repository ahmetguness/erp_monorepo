import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

const AttachmentRefSchema = z.object({ id: z.string(), fileName: z.string(), mimeType: z.string().nullable() });
const InvoiceDraftSchema = z.object({
  invoiceNumber: z.string().nullable(),
  taxNumber: z.string().nullable(),
  contactName: z.string().nullable(),
  matchedContactId: z.string().nullable(),
  totalNet: z.number().nonnegative(),
  totalTax: z.number().nonnegative(),
  totalGross: z.number().nonnegative(),
  sourceAttachmentId: z.string(),
  items: z.array(z.object({
    description: z.string(), quantity: z.number(), unitPrice: z.number(),
    matchedProductId: z.string().nullable(), matchedProductName: z.string().nullable(),
  })),
});
const SuggestionSchema = z.object({
  id: z.string(), useCase: z.literal('INVOICE_OCR'), confidenceScore: z.number().min(0).max(1),
  requiresApproval: z.literal(true), module: z.string(), actionPermission: z.string(), summary: z.string(), explanation: z.string(),
  draftData: InvoiceDraftSchema,
  businessRulesValidation: z.object({ passed: z.boolean(), checks: z.array(z.object({ rule: z.string(), ok: z.boolean(), message: z.string() })) }),
});
const ReadySchema = z.object({
  attachment: AttachmentRefSchema, status: z.literal('DRAFT_READY'), providerRequired: z.literal(false), provider: z.string(),
  suggestion: SuggestionSchema, possibleDuplicate: z.object({ id: z.string(), number: z.string() }).nullable(),
  lowConfidenceFields: z.array(z.string()), previewText: z.string(),
});
const ProviderRequiredSchema = z.object({
  attachment: AttachmentRefSchema, status: z.literal('PROVIDER_REQUIRED'), providerRequired: z.literal(true), message: z.string(),
});
const DocumentDraftSchema = z.discriminatedUnion('status', [ReadySchema, ProviderRequiredSchema]);
const ExecutionResultSchema = z.object({ success: z.boolean(), resultId: z.string().optional(), message: z.string() });

export type DocumentDraft = z.infer<typeof DocumentDraftSchema>;
export type ReadyDocumentDraft = z.infer<typeof ReadySchema>;

export async function extractDocumentDraft(attachmentId: string): Promise<DocumentDraft> {
  const response = await apiClient.get(`/api/intelligence/ocr/attachments/${attachmentId}/draft`);
  return safeParse(SingleResponseSchema(DocumentDraftSchema), response.data, 'extractDocumentDraft').data;
}

export async function approveDocumentDraft(draft: ReadyDocumentDraft) {
  const response = await apiClient.post('/api/intelligence/ai/execute-suggestion', {
    useCase: draft.suggestion.useCase,
    draftData: draft.suggestion.draftData,
  });
  return safeParse(SingleResponseSchema(ExecutionResultSchema), response.data, 'approveDocumentDraft').data;
}
