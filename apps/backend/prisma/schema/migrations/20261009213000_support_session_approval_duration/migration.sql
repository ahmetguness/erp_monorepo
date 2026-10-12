ALTER TABLE "support_sessions"
ADD COLUMN "durationMinutes" INTEGER;

UPDATE "support_sessions"
SET "durationMinutes" = LEAST(
  60,
  GREATEST(5, CEIL(EXTRACT(EPOCH FROM ("expiresAt" - "createdAt")) / 60)::INTEGER)
);

ALTER TABLE "support_sessions"
ALTER COLUMN "durationMinutes" SET NOT NULL;

ALTER TABLE "support_sessions"
ADD CONSTRAINT "support_sessions_durationMinutes_check"
CHECK ("durationMinutes" BETWEEN 5 AND 60);
