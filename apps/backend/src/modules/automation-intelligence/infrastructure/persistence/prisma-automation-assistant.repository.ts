import { AutomationAction, AutomationTrigger } from '@prisma/client';
import { prisma } from '../../../../lib/prisma.js';
import { previewAutomationTrigger } from '../../../../services/automation-rule.service.js';
import type { AutomationAssistantRepository, ExistingAutomationRule } from '../../application/automation-assistant/index.js';

const TRIGGER_TO_PRISMA: Record<ExistingAutomationRule['trigger'], AutomationTrigger> = {
  LOW_STOCK: AutomationTrigger.LOW_STOCK,
  OVERDUE_INVOICE: AutomationTrigger.OVERDUE_INVOICE,
  HIGH_VALUE_INVOICE: AutomationTrigger.HIGH_VALUE_INVOICE,
  LOW_MARGIN: AutomationTrigger.LOW_MARGIN,
  CHECK_DUE_SOON: AutomationTrigger.CHECK_DUE_SOON,
};

const ACTION_FROM_PRISMA: Record<AutomationAction, ExistingAutomationRule['action']> = {
  CREATE_TASK: 'CREATE_TASK',
  CREATE_NOTIFICATION: 'CREATE_NOTIFICATION',
  DRAFT_REMINDER_EMAIL: 'DRAFT_REMINDER_EMAIL',
  REQUEST_APPROVAL: 'REQUEST_APPROVAL',
  CREATE_PURCHASE_REQUEST_DRAFT: 'CREATE_PURCHASE_REQUEST_DRAFT',
};

export class PrismaAutomationAssistantRepository implements AutomationAssistantRepository {
  async simulate(tenantId: string, trigger: ExistingAutomationRule['trigger']) {
    const matches = await previewAutomationTrigger(tenantId, TRIGGER_TO_PRISMA[trigger]);
    const monetaryValues = matches.flatMap((match) => match.monetaryImpact === null ? [] : [match.monetaryImpact]);
    return {
      matchedCount: matches.length,
      estimatedMonetaryAmount: monetaryValues.length > 0 ? monetaryValues.reduce((total, value) => total + value, 0) : null,
      examples: matches.slice(0, 5).map(({ title, detail }) => ({ title, detail })),
    };
  }

  async listExisting(tenantId: string): Promise<ExistingAutomationRule[]> {
    const rules = await prisma.automationRule.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, trigger: true, action: true, isActive: true },
    });
    return rules.map((rule) => ({
      ...rule,
      trigger: rule.trigger,
      action: ACTION_FROM_PRISMA[rule.action],
    }));
  }
}
