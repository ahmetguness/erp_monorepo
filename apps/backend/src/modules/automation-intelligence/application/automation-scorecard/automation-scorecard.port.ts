import type { AutomationFeedbackInput } from './automation-scorecard.types.js';
export interface ScorecardExecutionRecord { id: string; process: string; status: 'RUNNING' | 'SUCCEEDED' | 'FAILED'; attempt: number; startedAt: Date; error: string | null }
export interface ScorecardFeedbackRecord extends AutomationFeedbackInput { executionId: string }
export interface AutomationScorecardRepository {
  listExecutions(tenantId: string, since: Date): Promise<ScorecardExecutionRecord[]>; listFeedback(tenantId: string, since: Date): Promise<ScorecardFeedbackRecord[]>; countRecoveries(tenantId: string, since: Date): Promise<number>;
  executionExists(tenantId: string, executionId: string): Promise<boolean>; saveFeedback(tenantId: string, userId: string, executionId: string, input: AutomationFeedbackInput): Promise<void>;
}
