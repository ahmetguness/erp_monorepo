import { z } from 'zod';
import { apiClient } from '@/lib/api-client';

export const AiBusinessRuleCheckSchema = z.object({
  rule: z.string(),
  ok: z.boolean(),
  message: z.string(),
});

export const AiSuggestionSchema = z.object({
  id: z.string(),
  useCase: z.string(),
  confidenceScore: z.number(),
  requiresApproval: z.boolean(),
  module: z.string(),
  actionPermission: z.string(),
  summary: z.string(),
  explanation: z.string(),
  draftData: z.record(z.string(), z.unknown()),
  businessRulesValidation: z.object({
    passed: z.boolean(),
    checks: z.array(AiBusinessRuleCheckSchema),
  }),
});

export type AiSuggestion = z.infer<typeof AiSuggestionSchema>;

export async function processInvoiceOcr(text: string): Promise<AiSuggestion> {
  const res = await apiClient.post('/api/intelligence/ai/ocr', { text });
  return res.data.data;
}

export async function extractOrderFromEmail(subject: string, body: string): Promise<AiSuggestion> {
  const res = await apiClient.post('/api/intelligence/ai/email-to-order', { subject, body });
  return res.data.data;
}

export async function matchPaymentDescription(description: string, amount: number): Promise<AiSuggestion> {
  const res = await apiClient.post('/api/intelligence/ai/match-payment', { description, amount });
  return res.data.data;
}

export async function detectAiAnomalies(): Promise<AiSuggestion> {
  const res = await apiClient.get('/api/intelligence/ai/anomalies');
  return res.data.data;
}

export async function processNlErpQuery(prompt: string): Promise<{ query: string; answerSummary: string; data: unknown }> {
  const res = await apiClient.post('/api/intelligence/ai/nl-query', { prompt });
  return res.data.data;
}

export async function executeAiSuggestion(useCase: string, draftData: Record<string, unknown>): Promise<{ success: boolean; resultId?: string; message: string }> {
  const res = await apiClient.post('/api/intelligence/ai/execute-suggestion', { useCase, draftData });
  return res.data.data;
}
