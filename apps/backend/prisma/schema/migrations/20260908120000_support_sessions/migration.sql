CREATE TABLE "support_sessions" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "adminId" TEXT NOT NULL REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "adminSessionId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reason" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "revokedAt" TIMESTAMP(3),
  "writeRequested" BOOLEAN NOT NULL DEFAULT false,
  "writeApprovedAt" TIMESTAMP(3),
  "writeApprovedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "support_sessions_tenantId_createdAt_idx" ON "support_sessions"("tenantId", "createdAt");
CREATE INDEX "support_sessions_adminId_expiresAt_idx" ON "support_sessions"("adminId", "expiresAt");
