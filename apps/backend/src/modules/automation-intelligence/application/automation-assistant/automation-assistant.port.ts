import type {
  AutomationAssistantAction,
  AutomationAssistantTrigger,
  AutomationSimulation,
} from "./automation-assistant.types.js";

export interface ExistingAutomationRule {
  id: string;
  name: string;
  trigger: AutomationAssistantTrigger;
  action: AutomationAssistantAction;
  isActive: boolean;
}

export interface AutomationAssistantRepository {
  simulate(
    tenantId: string,
    trigger: AutomationAssistantTrigger,
  ): Promise<AutomationSimulation>;
  listExisting(tenantId: string): Promise<ExistingAutomationRule[]>;
}
