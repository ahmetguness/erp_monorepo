ALTER TABLE "storage_reservations"
  ADD COLUMN "cleanupAfter" TIMESTAMP(3),
  ADD COLUMN "cleanupAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cleanupCompletedAt" TIMESTAMP(3);

CREATE INDEX "storage_reservations_cleanupAfter_cleanupAttempts_idx"
  ON "storage_reservations" ("cleanupAfter", "cleanupAttempts");

UPDATE "storage_reservations" SET "cleanupAfter"=CURRENT_TIMESTAMP
WHERE "status" IN ('REJECTED','EXPIRED','CANCELLED');
