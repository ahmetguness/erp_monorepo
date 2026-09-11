CREATE TABLE "platform_backup_evidence" (
  "id" TEXT NOT NULL, "providerRef" TEXT NOT NULL, "status" TEXT NOT NULL, "sizeBytes" BIGINT NOT NULL,
  "encrypted" BOOLEAN NOT NULL, "encryptionKeyRef" TEXT, "region" TEXT NOT NULL, "replicaRegion" TEXT,
  "replicationLagSeconds" INTEGER, "startedAt" TIMESTAMP(3) NOT NULL, "completedAt" TIMESTAMP(3) NOT NULL,
  "recordedById" TEXT NOT NULL, "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_backup_evidence_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "platform_restore_drills" (
  "id" TEXT NOT NULL, "backupId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "environment" TEXT NOT NULL, "runbookUrl" TEXT NOT NULL, "approvalId" TEXT NOT NULL, "requestedById" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "recoveryPointAt" TIMESTAMP(3),
  "actualRpoMinutes" INTEGER, "actualRtoMinutes" INTEGER, "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_restore_drills_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "platform_disaster_recovery_policies" (
  "id" TEXT NOT NULL DEFAULT 'default', "targetRpoMinutes" INTEGER NOT NULL DEFAULT 60,
  "targetRtoMinutes" INTEGER NOT NULL DEFAULT 240, "maxReplicationLagSeconds" INTEGER NOT NULL DEFAULT 300,
  "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_disaster_recovery_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "platform_backup_evidence_providerRef_key" ON "platform_backup_evidence"("providerRef");
CREATE INDEX "platform_backup_evidence_status_completedAt_idx" ON "platform_backup_evidence"("status", "completedAt");
CREATE INDEX "platform_restore_drills_status_createdAt_idx" ON "platform_restore_drills"("status", "createdAt");
CREATE INDEX "platform_restore_drills_backupId_createdAt_idx" ON "platform_restore_drills"("backupId", "createdAt");
ALTER TABLE "platform_restore_drills" ADD CONSTRAINT "platform_restore_drills_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "platform_backup_evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
INSERT INTO "platform_disaster_recovery_policies" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);
