import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

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

export type Recommendation = z.infer<typeof RecommendationSchema>;
export type AutomationRuleTemplate = z.infer<typeof AutomationRuleTemplateSchema>;
export type SectorTemplate = z.infer<typeof SectorTemplateSchema>;

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
