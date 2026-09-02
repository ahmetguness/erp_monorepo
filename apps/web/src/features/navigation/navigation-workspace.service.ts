import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';

export const NavigationPersonaSchema = z.enum(['AUTO', 'SALES', 'FINANCE', 'OPERATIONS', 'PEOPLE', 'MANAGEMENT']);
const NavigationGoalSchema = z.object({ id: z.string(), label: z.string(), description: z.string(), href: z.string(), module: z.string().nullable() });
const NavigationWorkspaceSchema = z.object({
  persona: NavigationPersonaSchema,
  effectivePersona: NavigationPersonaSchema.exclude(['AUTO']),
  allowedModules: z.union([z.literal('*'), z.array(z.string())]),
  favoriteHrefs: z.array(z.string()),
  hiddenModules: z.array(z.string()),
  recentHrefs: z.array(z.string()),
  usage: z.record(z.string(), z.number()),
  goals: z.array(NavigationGoalSchema),
  canDistributeProfiles: z.boolean(),
});
const ResponseSchema = z.object({ data: NavigationWorkspaceSchema });

export type NavigationPersona = z.infer<typeof NavigationPersonaSchema>;
export type NavigationWorkspace = z.infer<typeof NavigationWorkspaceSchema>;
export interface NavigationPreferenceInput { persona: NavigationPersona; favoriteHrefs: string[]; hiddenModules: string[] }

export async function getNavigationWorkspace(): Promise<NavigationWorkspace> {
  const response = await apiClient.get('/api/navigation-workspace');
  return safeParse(ResponseSchema, response.data, 'getNavigationWorkspace').data;
}

export async function updateNavigationPreferences(input: NavigationPreferenceInput): Promise<NavigationWorkspace> {
  const response = await apiClient.patch('/api/navigation-workspace/preferences', input);
  return safeParse(ResponseSchema, response.data, 'updateNavigationPreferences').data;
}

export async function recordNavigationActivity(href: string): Promise<void> {
  await apiClient.post('/api/navigation-workspace/activity', { href });
}

export async function distributeNavigationProfile(roleId: string, input: NavigationPreferenceInput): Promise<number> {
  const response = await apiClient.put(`/api/navigation-workspace/profiles/${roleId}`, input);
  return z.object({ data: z.object({ updatedUsers: z.number() }) }).parse(response.data).data.updatedUsers;
}
