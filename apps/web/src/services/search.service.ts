import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';

export const GlobalSearchResultSchema = z.object({
  id: z.string(),
  type: z.enum([
    'product',
    'contact',
    'invoice',
    'sales_quote',
    'sales_order',
    'purchase_order',
    'payment',
    'stock_movement',
    'mail',
    'employee',
    'service_request',
    'document',
    'task',
    'action',
  ]),
  kind: z.enum(['record', 'action']).default('record'),
  module: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  href: z.string(),
  status: z.string().nullable().default(null),
  date: z.string().nullable().default(null),
  amount: z.string().nullable().default(null),
  meta: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
});

const GlobalSearchResponseSchema = z.object({
  data: z.array(GlobalSearchResultSchema),
  meta: z.object({ query: z.string(), total: z.coerce.number() }),
});

export type GlobalSearchResult = z.infer<typeof GlobalSearchResultSchema>;

export const UnifiedIntentOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  href: z.string(),
});

export const UnifiedIntentPreviewSchema = z.object({
  id: z.string(),
  title: z.string(),
  explanation: z.string(),
  confidence: z.number().min(0).max(1),
  risk: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  status: z.enum(['READY', 'NEEDS_CLARIFICATION']),
  requiresConfirmation: z.boolean(),
  href: z.string().nullable(),
  options: z.array(UnifiedIntentOptionSchema),
});

const UnifiedSearchResponseSchema = z.object({
  data: z.object({
    query: z.string(),
    mode: z.enum(['SEARCH', 'COMMAND', 'AMBIGUOUS']),
    results: z.array(GlobalSearchResultSchema),
    intent: UnifiedIntentPreviewSchema.nullable(),
    contextualShortcuts: z.array(GlobalSearchResultSchema),
  }),
});

const UnifiedCommandHandoffSchema = z.object({
  data: z.object({
    intentId: z.string(),
    href: z.string(),
    message: z.string(),
    mutationExecuted: z.literal(false),
  }),
});

export type UnifiedSearchResponse = z.infer<typeof UnifiedSearchResponseSchema>['data'];
export type UnifiedCommandHandoff = z.infer<typeof UnifiedCommandHandoffSchema>['data'];

export async function searchGlobal(query: string, limit = 12): Promise<GlobalSearchResult[]> {
  const res = await apiClient.get('/api/search', { params: { q: query, limit } });
  return safeParse(GlobalSearchResponseSchema, res.data, 'searchGlobal').data;
}

export async function searchUnified(query: string, recentHrefs: string[], limit = 12): Promise<UnifiedSearchResponse> {
  const res = await apiClient.post('/api/search/unified', { query, recentHrefs, limit });
  return safeParse(UnifiedSearchResponseSchema, res.data, 'searchUnified').data;
}

export async function confirmUnifiedCommand(input: {
  query: string;
  intentId: string;
  selectedOptionId: string | null;
}): Promise<UnifiedCommandHandoff> {
  const res = await apiClient.post('/api/search/unified/confirm', { ...input, recentHrefs: [], limit: 12, confirmed: true });
  return safeParse(UnifiedCommandHandoffSchema, res.data, 'confirmUnifiedCommand').data;
}
