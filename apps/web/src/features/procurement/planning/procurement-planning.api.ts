import { apiClient } from '@/lib/api-client';
import { ReplenishmentPolicySchema, ReplenishmentRunResultSchema, ReplenishmentWorkspaceSchema, type ReplenishmentPolicy, type ReplenishmentWorkspace } from './procurement-planning.schemas';

export async function getReplenishmentWorkspace(): Promise<ReplenishmentWorkspace> { const response = await apiClient.get('/api/procurement-autonomy/planning-workspace'); return ReplenishmentWorkspaceSchema.parse(response.data.data); }
export async function updateReplenishmentPolicy(policy: ReplenishmentPolicy): Promise<ReplenishmentPolicy> { const response = await apiClient.put('/api/procurement-autonomy/planning-policy', policy); return ReplenishmentPolicySchema.parse(response.data.data); }
export async function runReplenishmentPlanning() { const response = await apiClient.post('/api/procurement-autonomy/planning-run'); return ReplenishmentRunResultSchema.parse(response.data.data); }
