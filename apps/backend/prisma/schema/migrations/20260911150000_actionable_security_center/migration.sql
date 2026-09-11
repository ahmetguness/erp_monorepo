CREATE TABLE "platform_security_findings" (
  "id" TEXT NOT NULL, "key" TEXT NOT NULL, "title" TEXT NOT NULL, "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "verificationStatus" TEXT NOT NULL,
  "owner" TEXT, "remediation" TEXT NOT NULL, "evidence" JSONB NOT NULL, "ticketId" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3), "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_security_findings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "platform_security_findings_key_key" ON "platform_security_findings"("key");
CREATE INDEX "platform_security_findings_status_severity_lastSeenAt_idx" ON "platform_security_findings"("status", "severity", "lastSeenAt");
CREATE INDEX "platform_security_findings_category_verificationStatus_idx" ON "platform_security_findings"("category", "verificationStatus");
