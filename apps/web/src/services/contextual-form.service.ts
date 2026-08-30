import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const ContextualFormKindSchema = z.enum(['invoice', 'contact', 'product']);
const ContextualFormSectionSchema = z.object({
  id: z.string(), label: z.string(), level: z.enum(['essential', 'advanced']), fields: z.array(z.string()),
  visibleWhen: z.object({ field: z.string(), oneOf: z.array(z.string()) }).optional(),
});
export const ContextualFormPolicySchema = z.object({
  formKind: ContextualFormKindSchema,
  context: z.string(),
  sections: z.array(ContextualFormSectionSchema),
  requiredFields: z.array(z.string()),
  autoSaveIntervalMs: z.number().int().min(500).max(30_000),
  quickEntry: z.boolean(),
  allowLineDuplication: z.boolean(),
  shortcuts: z.object({ save: z.string(), addLine: z.string() }),
});

export type ContextualFormKind = z.infer<typeof ContextualFormKindSchema>;
export type ContextualFormPolicy = z.infer<typeof ContextualFormPolicySchema>;

export async function getContextualFormPolicy(formKind: ContextualFormKind, context?: string): Promise<ContextualFormPolicy> {
  const response = await apiClient.get(`/api/contextual-forms/policy/${formKind}`, { params: { context } });
  return safeParse(SingleResponseSchema(ContextualFormPolicySchema), response.data, 'getContextualFormPolicy').data;
}
