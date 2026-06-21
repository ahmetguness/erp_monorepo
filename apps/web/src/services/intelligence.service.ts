import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { PaginatedResponseSchema, SingleResponseSchema } from '@/types/api.types';

export const RecommendationSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  detail: z.string(),
  severity: z.string(),
  module: z.string(),
  href: z.string(),
  actionLabel: z.string(),
  assistantPrompt: z.string(),
  value: z.coerce.number(),
});

export const AutomationRuleTemplateSchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string(),
  trigger: z.string(),
  action: z.string(),
  module: z.string(),
  requiredModules: z.array(z.string()),
  requiredPermission: z.string(),
});

export const SectorTemplateSchema = z.object({
  key: z.string(),
  title: z.string(),
  modules: z.array(z.string()),
  dashboardFocus: z.array(z.string()),
  starterSettings: z.array(z.string()),
  automationTemplates: z.array(z.string()),
});

const AiRequestTypeSchema = z.enum(['PRIVATE_CHAT', 'PUBLIC_CHAT', 'MAIL_DRAFT', 'SMART_FORM', 'RECOMMENDED_ACTION', 'OTHER']);
const AiRequestStatusSchema = z.enum(['STARTED', 'SUCCEEDED', 'FAILED', 'FALLBACK']);
const AiPermissionCheckResultSchema = z.enum(['NOT_REQUIRED', 'ALLOWED', 'DENIED', 'PARTIAL']);
const AiDataSharingPolicySchema = z.enum(['BUSINESS_CONTEXT', 'NO_ENTITY_CONTEXT']);
const AiJsonSchema = z.unknown().nullable();

export const AiGovernancePolicySchema = z.object({
  enabled: z.boolean(),
  dataSharingPolicy: AiDataSharingPolicySchema,
  logPrompts: z.boolean(),
});

export const AiRedactionRegistrySchema = z.object({
  fieldKeys: z.array(z.string()),
  rules: z.array(z.object({
    key: z.string(),
    label: z.string(),
    scope: z.enum(['all', 'public']),
  })),
});

export const AiGovernancePolicyResponseSchema = z.object({
  policy: AiGovernancePolicySchema,
  redactionRegistry: AiRedactionRegistrySchema,
});

export const AiRequestLogSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  requestType: AiRequestTypeSchema,
  promptVersion: z.string(),
  model: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  entityContext: AiJsonSchema,
  permissionCheckResult: AiPermissionCheckResultSchema,
  redactedFields: z.array(z.string()),
  inputSummary: z.string().nullable(),
  outputSummary: z.string().nullable(),
  draft: AiJsonSchema,
  result: AiJsonSchema,
  userApprovedAction: z.string().nullable(),
  status: AiRequestStatusSchema,
  usedTools: z.boolean(),
  tokenPrompt: z.number().nullable(),
  tokenCompletion: z.number().nullable(),
  tokenTotal: z.number().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;
export type AutomationRuleTemplate = z.infer<typeof AutomationRuleTemplateSchema>;
export type SectorTemplate = z.infer<typeof SectorTemplateSchema>;
export type AiGovernancePolicy = z.infer<typeof AiGovernancePolicySchema>;
export type AiGovernancePolicyResponse = z.infer<typeof AiGovernancePolicyResponseSchema>;
export type AiRequestLog = z.infer<typeof AiRequestLogSchema>;
export type AiRequestType = z.infer<typeof AiRequestTypeSchema>;
export type AiRequestStatus = z.infer<typeof AiRequestStatusSchema>;

export interface AiGovernanceLogParams {
  page?: number;
  limit?: number;
  requestType?: AiRequestType;
  status?: AiRequestStatus;
  userId?: string;
}

export interface AiActionAuditPayload {
  actionId: string;
  actionType: 'mail' | 'task' | string;
  module: string;
  entityType: string;
  entityId: string;
  summary?: string;
  resultSummary?: string;
  entityContext?: Record<string, unknown>;
  draft?: Record<string, unknown>;
  mutationResult?: Record<string, unknown>;
  status?: 'SUCCEEDED' | 'FAILED';
}

export async function getRecommendations(): Promise<Recommendation[]> {
  const res = await apiClient.get('/api/intelligence/recommendations');
  return safeParse(SingleResponseSchema(z.array(RecommendationSchema)), res.data, 'recommendations').data;
}

export async function getAutomationRuleTemplates(): Promise<AutomationRuleTemplate[]> {
  const res = await apiClient.get('/api/intelligence/automation-rules/templates');
  return safeParse(SingleResponseSchema(z.array(AutomationRuleTemplateSchema)), res.data, 'automationRuleTemplates').data;
}

export async function getSectorTemplates(): Promise<SectorTemplate[]> {
  const res = await apiClient.get('/api/intelligence/sector-templates');
  return safeParse(SingleResponseSchema(z.array(SectorTemplateSchema)), res.data, 'sectorTemplates').data;
}

export async function getAiGovernanceLogs(params: AiGovernanceLogParams = {}) {
  const res = await apiClient.get('/api/intelligence/ai-governance/logs', { params });
  return safeParse(PaginatedResponseSchema(AiRequestLogSchema), res.data, 'aiGovernanceLogs');
}

export async function getAiGovernancePolicy(): Promise<AiGovernancePolicyResponse> {
  const res = await apiClient.get('/api/intelligence/ai-governance/policy');
  return safeParse(SingleResponseSchema(AiGovernancePolicyResponseSchema), res.data, 'aiGovernancePolicy').data;
}

export async function updateAiGovernancePolicy(policy: AiGovernancePolicy): Promise<AiGovernancePolicyResponse> {
  const res = await apiClient.put('/api/intelligence/ai-governance/policy', policy);
  return safeParse(SingleResponseSchema(AiGovernancePolicyResponseSchema), res.data, 'updateAiGovernancePolicy').data;
}

export async function recordAiActionAudit(payload: AiActionAuditPayload): Promise<{ recorded: boolean }> {
  const res = await apiClient.post('/api/intelligence/ai-governance/action-audit', payload);
  return safeParse(SingleResponseSchema(z.object({ recorded: z.boolean() })), res.data, 'recordAiActionAudit').data;
}
