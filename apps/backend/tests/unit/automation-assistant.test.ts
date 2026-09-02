import { AutomationAction, AutomationTrigger } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { AutomationAssistantRepository } from '../../src/modules/automation-intelligence/application/automation-assistant/index.js';
import { compileAutomationIntent, PreviewAutomationAssistantQuery } from '../../src/modules/automation-intelligence/application/automation-assistant/index.js';
import { evaluateAutomationDecision } from '../../src/modules/automation-intelligence/application/automation-governance/index.js';

const policyRepository = {
  get: async () => ({ approvalThreshold: 100000, minimumAutomaticConfidence: 0.85 }),
  save: async (_tenantId: string, policy: { approvalThreshold: number; minimumAutomaticConfidence: number }) => policy,
};

describe('automation assistant', () => {
  it('compiles business language into an inactive, typed rule draft', () => {
    const result = compileAutomationIntent('Vadesi geçen faturaları sorumluya bildir');
    expect(result.draft.trigger).toBe(AutomationTrigger.OVERDUE_INVOICE);
    expect(result.draft.action).toBe(AutomationAction.CREATE_NOTIFICATION);
    expect(result.draft.isActive).toBe(false);
  });

  it('returns dry-run impact and duplicate-rule warning', async () => {
    const repository: AutomationAssistantRepository = {
      simulate: async () => ({ matchedCount: 2, estimatedMonetaryAmount: null, examples: [{ title: 'INV-1', detail: 'Gecikmis' }] }),
      listExisting: async () => [{ id: 'rule-1', name: 'Mevcut takip', trigger: AutomationTrigger.LOW_STOCK, action: AutomationAction.CREATE_TASK, isActive: true }],
    };
    const result = await new PreviewAutomationAssistantQuery(repository, policyRepository).execute('tenant-1', 'Stok minimum altına düşünce görev oluştur');
    expect(result.simulation.matchedCount).toBe(2);
    expect(result.conflicts[0]?.severity).toBe('WARNING');
    expect(result.recommendedMode).toBe('SUGGESTION');
    expect(result.decision.control.dryRun).toBe(true);
  });

  it('requires approval when estimated monetary impact reaches tenant threshold', () => {
    const decision = evaluateAutomationDecision({
      tenantId: 'tenant-1', ruleId: 'rule-1', trigger: 'HIGH_VALUE_INVOICE', action: 'REQUEST_APPROVAL',
      reason: 'Yuksek tutar', sources: ['invoice'], confidence: 0.95, matchedRecords: 1,
      estimatedMonetaryAmount: 125000, dryRun: false,
    }, { approvalThreshold: 100000, minimumAutomaticConfidence: 0.85 });
    expect(decision.risk.level).toBe('HIGH');
    expect(decision.control.requiresApproval).toBe(true);
    expect(decision.control.idempotencyKey).toContain('tenant-1:rule-1');
  });
});
