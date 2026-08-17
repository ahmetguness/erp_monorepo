import { z } from 'zod';
import { apiClient } from '@/lib/api-client';

export const ParsedCommandStepSchema = z.object({
  stepIndex: z.number(),
  intent: z.string(),
  actionDescription: z.string(),
  targetEntity: z.string(),
  status: z.enum(['PENDING', 'EXECUTED', 'FAILED']),
});

export const ParsedCommandPlanSchema = z.object({
  planId: z.string(),
  prompt: z.string(),
  intentCategory: z.string(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  steps: z.array(ParsedCommandStepSchema),
  requiresApproval: z.boolean(),
  createdAt: z.string(),
});

export const SelfCorrectingSuggestionSchema = z.object({
  suggestionId: z.string(),
  triggerCondition: z.string(),
  actionToAutomate: z.string(),
  confidencePct: z.number(),
  recommendedRuleName: z.string(),
  isAdopted: z.boolean(),
});

export type ParsedCommandPlan = z.infer<typeof ParsedCommandPlanSchema>;
export type SelfCorrectingSuggestion = z.infer<typeof SelfCorrectingSuggestionSchema>;

export async function parsePrompt(prompt: string): Promise<ParsedCommandPlan> {
  const res = await apiClient.post('/api/agent-command/parse-prompt', { prompt });
  return res.data.data;
}

export async function executePlan(planId: string): Promise<{ success: boolean; message: string; executedStepsCount: number }> {
  const res = await apiClient.post('/api/agent-command/execute-plan', { planId });
  return res.data.data;
}

export async function getWorkflowSuggestions(): Promise<SelfCorrectingSuggestion[]> {
  const res = await apiClient.get('/api/agent-command/workflow-suggestions');
  return res.data.data;
}

export async function adoptSuggestion(suggestionId: string): Promise<{ success: boolean; message: string; ruleId: string }> {
  const res = await apiClient.post('/api/agent-command/adopt-suggestion', { suggestionId });
  return res.data.data;
}
