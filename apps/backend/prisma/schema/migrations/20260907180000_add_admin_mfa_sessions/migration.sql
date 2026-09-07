ALTER TABLE "admin_users"
ADD COLUMN "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "mfaSecretEncrypted" TEXT,
ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mfaLastCounter" INTEGER NOT NULL DEFAULT -1,
ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3),
ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "admin_sessions" (
  "tokenVersion" INTEGER NOT NULL DEFAULT 0,
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "deviceName" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "rememberMe" BOOLEAN NOT NULL DEFAULT false,
  "mfaVerifiedAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_sessions_refreshTokenHash_key" ON "admin_sessions"("refreshTokenHash");
CREATE INDEX "admin_sessions_adminUserId_revokedAt_expiresAt_idx" ON "admin_sessions"("adminUserId", "revokedAt", "expiresAt");
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "admin_security_events" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_security_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_security_events_adminUserId_createdAt_idx" ON "admin_security_events"("adminUserId", "createdAt");
ALTER TABLE "admin_security_events" ADD CONSTRAINT "admin_security_events_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
