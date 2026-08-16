import { AutomationExecutionStatus, type AutomationAction, type AutomationTrigger, type EntityType, type Prisma, type PrismaClient } from '@prisma/client';

type AutomationExecutionDbClient = PrismaClient | Prisma.TransactionClient;

export interface StartAutomationExecutionInput {
  tenantId: string;
  ruleId?: string | null;
  trigger?: AutomationTrigger | null;
  action?: AutomationAction | null;
  entityType?: EntityType | null;
  entityId?: string | null;
  input?: Prisma.InputJsonValue | null;
}

export interface FinishAutomationExecutionInput {
  tenantId: string;
  executionId: string;
  output?: Prisma.InputJsonValue | null;
}

export interface FailAutomationExecutionInput {
  tenantId: string;
  executionId: string;
  error: string;
  output?: Prisma.InputJsonValue | null;
}

export class AutomationExecutionService {
  constructor(private readonly db: AutomationExecutionDbClient) {}

  async start(input: StartAutomationExecutionInput) {
    return this.db.automationExecution.create({
      data: {
        tenantId: input.tenantId,
        ruleId: input.ruleId ?? null,
        trigger: input.trigger ?? null,
        action: input.action ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        input: input.input ?? undefined,
        status: AutomationExecutionStatus.RUNNING,
      },
    });
  }

  async succeed(input: FinishAutomationExecutionInput) {
    return this.db.automationExecution.updateMany({
      where: { id: input.executionId, tenantId: input.tenantId },
      data: {
        status: AutomationExecutionStatus.SUCCEEDED,
        output: input.output ?? undefined,
        completedAt: new Date(),
      },
    });
  }

  async fail(input: FailAutomationExecutionInput) {
    return this.db.automationExecution.updateMany({
      where: { id: input.executionId, tenantId: input.tenantId },
      data: {
        status: AutomationExecutionStatus.FAILED,
        output: input.output ?? undefined,
        error: input.error.slice(0, 2000),
        completedAt: new Date(),
      },
    });
  }
}
