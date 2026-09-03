import { describe, expect, it } from 'vitest';
import { AutomationScorecardService, type AutomationScorecardRepository } from '../../src/modules/automation-intelligence/application/automation-scorecard/index.js';

function repository(): AutomationScorecardRepository {
  return {
    listExecutions: async () => [
      { id: 'one', process: 'invoicing', status: 'SUCCEEDED', attempt: 1, startedAt: new Date(), error: null },
      { id: 'two', process: 'invoicing', status: 'FAILED', attempt: 2, startedAt: new Date(), error: 'provider error' },
    ],
    listFeedback: async () => [{ executionId: 'one', outcome: 'ACCEPTED', reason: 'Doğru sonuç', estimatedMinutesSaved: 12, financialImpact: 100 }],
    countRecoveries: async () => 1,
    executionExists: async (_tenantId, executionId) => executionId === 'one',
    saveFeedback: async () => undefined,
  };
}

describe('automation scorecard', () => {
  it('measures process outcomes without user performance data', async () => {
    const scorecard = await new AutomationScorecardService(repository()).get('tenant-1', 30);
    expect(scorecard.totals).toMatchObject({ executions: 2, automaticallyCompleted: 1, failed: 1, accepted: 1, recoveries: 1, estimatedHoursSaved: 0.2, financialImpact: 100 });
    expect(scorecard.processes[0]).toMatchObject({ process: 'invoicing', successRatePct: 50, straightThroughRatePct: 50 });
    expect(scorecard.errorBudget.breached).toBe(true);
    expect(scorecard.reviewQueue).toEqual([]);
  });

  it('does not accept feedback for another tenant execution', async () => {
    await expect(new AutomationScorecardService(repository()).feedback('tenant-1', 'user-1', 'foreign', { outcome: 'REJECTED', reason: null, estimatedMinutesSaved: null, financialImpact: null })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
