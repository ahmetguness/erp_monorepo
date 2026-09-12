ALTER TABLE "demo_requests"
  ADD COLUMN "ownerId" TEXT,
  ADD COLUMN "slaDueAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '4 hours');

CREATE TABLE "demo_request_history" (
  "id" TEXT NOT NULL,
  "demoRequestId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "demo_request_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "demo_request_history_demoRequestId_fkey"
    FOREIGN KEY ("demoRequestId") REFERENCES "demo_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "demo_request_history_demoRequestId_createdAt_idx"
  ON "demo_request_history"("demoRequestId", "createdAt");
