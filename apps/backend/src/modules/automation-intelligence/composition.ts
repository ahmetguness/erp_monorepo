import { PreviewAutomationAssistantQuery } from './application/automation-assistant/index.js';
import { PrismaAutomationAssistantRepository } from './infrastructure/persistence/prisma-automation-assistant.repository.js';
import { PrismaAutomationGovernancePolicyRepository } from './infrastructure/persistence/prisma-automation-governance-policy.repository.js';

const automationAssistantRepository = new PrismaAutomationAssistantRepository();
export const automationGovernancePolicyRepository = new PrismaAutomationGovernancePolicyRepository();

export const previewAutomationAssistantQuery = new PreviewAutomationAssistantQuery(automationAssistantRepository, automationGovernancePolicyRepository);
