CREATE TYPE "RecordCollaborationEntryType" AS ENUM ('COMMENT', 'DECISION', 'EMAIL_LINK');

CREATE TABLE "record_collaboration_entries" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "entityType" "EntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "type" "RecordCollaborationEntryType" NOT NULL DEFAULT 'COMMENT',
  "content" TEXT NOT NULL,
  "mentionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "externalId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "record_collaboration_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "record_followers" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "entityType" "EntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "record_followers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "record_collaboration_entries_tenantId_entityType_entityId_createdAt_idx" ON "record_collaboration_entries"("tenantId", "entityType", "entityId", "createdAt");
CREATE INDEX "record_collaboration_entries_tenantId_createdById_idx" ON "record_collaboration_entries"("tenantId", "createdById");
CREATE UNIQUE INDEX "record_followers_tenantId_entityType_entityId_userId_key" ON "record_followers"("tenantId", "entityType", "entityId", "userId");
CREATE INDEX "record_followers_tenantId_userId_createdAt_idx" ON "record_followers"("tenantId", "userId", "createdAt");

ALTER TABLE "record_collaboration_entries" ADD CONSTRAINT "record_collaboration_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "record_collaboration_entries" ADD CONSTRAINT "record_collaboration_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "record_followers" ADD CONSTRAINT "record_followers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "record_followers" ADD CONSTRAINT "record_followers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
