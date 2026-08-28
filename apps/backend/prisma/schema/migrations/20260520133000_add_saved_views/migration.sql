CREATE TYPE "SavedViewScope" AS ENUM ('PERSONAL', 'TENANT', 'ROLE');

CREATE TABLE "saved_views" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "roleId" TEXT,
  "name" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "listKey" TEXT NOT NULL,
  "scope" "SavedViewScope" NOT NULL DEFAULT 'PERSONAL',
  "state" JSONB NOT NULL DEFAULT '{}',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "saved_views"
  ADD CONSTRAINT "saved_views_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "saved_views_tenantId_listKey_idx" ON "saved_views"("tenantId", "listKey");
CREATE INDEX "saved_views_tenantId_userId_idx" ON "saved_views"("tenantId", "userId");
CREATE INDEX "saved_views_tenantId_roleId_idx" ON "saved_views"("tenantId", "roleId");
