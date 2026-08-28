ALTER TYPE "EntityType" ADD VALUE 'SALES_QUOTE';

ALTER TABLE "attachments"
  ADD COLUMN "category" TEXT,
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "documentKind" TEXT,
  ADD COLUMN "confidentiality" TEXT,
  ADD COLUMN "validFrom" TIMESTAMP(3),
  ADD COLUMN "validUntil" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "attachments_tenantId_category_idx" ON "attachments"("tenantId", "category");
