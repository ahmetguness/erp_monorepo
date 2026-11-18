export const PERFORMANCE_STAGES = { smoke: 25, probe50: 50, probe75: 75, baseline: 100, medium: 500, target: 1750, stress: 2500 } as const;
export type PerformanceStage = keyof typeof PERFORMANCE_STAGES;
export type PerformanceProfile = 'read' | 'write' | 'upload' | 'realtime' | 'mixed' | 'soak';
export interface PerformanceActor {
  tenantId: string;
  plan: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  userId: string;
  token: string;
  contactId: string;
  productId: string;
  warehouseId: string;
  cashAccountId: string;
  taxRateId: string;
  conversationId: string;
}
export interface PerformanceFixture { schemaVersion: 1; runId: string; actors: PerformanceActor[] }
