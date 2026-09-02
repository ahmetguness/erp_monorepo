import { AutomationAction, AutomationTrigger } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { AutomationAssistantRepository } from '../../src/modules/automation-intelligence/application/automation-assistant/index.js';
import { compileAutomationIntent, PreviewAutomationAssistantQuery } from '../../src/modules/automation-intelligence/application/automation-assistant/index.js';

describe('automation assistant', () => {
  it('compiles business language into an inactive, typed rule draft', () => {
    const result = compileAutomationIntent('Vadesi geçen faturaları sorumluya bildir');
    expect(result.draft.trigger).toBe(AutomationTrigger.OVERDUE_INVOICE);
    expect(result.draft.action).toBe(AutomationAction.CREATE_NOTIFICATION);
    expect(result.draft.isActive).toBe(false);
  });

  it('returns dry-run impact and duplicate-rule warning', async () => {
    const repository: AutomationAssistantRepository = {
      simulate: async () => ({ matchedCount: 2, examples: [{ title: 'INV-1', detail: 'Gecikmis' }] }),
      listExisting: async () => [{ id: 'rule-1', name: 'Mevcut takip', trigger: AutomationTrigger.LOW_STOCK, action: AutomationAction.CREATE_TASK, isActive: true }],
    };
    const result = await new PreviewAutomationAssistantQuery(repository).execute('tenant-1', 'Stok minimum altına düşünce görev oluştur');
    expect(result.simulation.matchedCount).toBe(2);
    expect(result.conflicts[0]?.severity).toBe('WARNING');
    expect(result.recommendedMode).toBe('SUGGESTION');
  });
});
