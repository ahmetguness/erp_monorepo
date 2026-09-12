CREATE TABLE "admin_inbox_task_states" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ownerId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admin_inbox_task_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_inbox_task_states_sourceType_sourceId_key"
ON "admin_inbox_task_states"("sourceType", "sourceId");

CREATE INDEX "admin_inbox_task_states_ownerId_resolvedAt_idx"
ON "admin_inbox_task_states"("ownerId", "resolvedAt");
