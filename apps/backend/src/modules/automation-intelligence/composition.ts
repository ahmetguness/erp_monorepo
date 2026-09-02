import { PreviewAutomationAssistantQuery } from './application/automation-assistant/index.js';
import { PrismaAutomationAssistantRepository } from './infrastructure/persistence/prisma-automation-assistant.repository.js';

const automationAssistantRepository = new PrismaAutomationAssistantRepository();

export const previewAutomationAssistantQuery = new PreviewAutomationAssistantQuery(automationAssistantRepository);
