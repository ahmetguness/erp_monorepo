CREATE TYPE "AgentCommandPlanStatus" AS ENUM ('PENDING', 'EXECUTED');

CREATE TABLE "agent_command_plans" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "intentCategory" TEXT NOT NULL,
  "riskLevel" TEXT NOT NULL,
  "steps" JSONB NOT NULL,
  "requiresApproval" BOOLEAN NOT NULL,
  "status" "AgentCommandPlanStatus" NOT NULL DEFAULT 'PENDING',
  "approvedAt" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_command_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_command_plans_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_command_plans_prompt_length_check" CHECK (char_length("prompt") BETWEEN 1 AND 2000),
  CONSTRAINT "agent_command_plans_execution_state_check" CHECK (
    ("status" = 'PENDING' AND "approvedAt" IS NULL AND "executedAt" IS NULL)
    OR
    ("status" = 'EXECUTED' AND "approvedAt" IS NOT NULL AND "executedAt" IS NOT NULL)
  )
);

CREATE INDEX "agent_command_plans_tenantId_userId_createdAt_idx"
  ON "agent_command_plans"("tenantId", "userId", "createdAt");
CREATE INDEX "agent_command_plans_tenantId_status_idx"
  ON "agent_command_plans"("tenantId", "status");
