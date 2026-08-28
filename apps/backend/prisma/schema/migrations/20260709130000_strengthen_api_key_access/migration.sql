ALTER TABLE "api_keys" ADD COLUMN "ipAllowlist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "api_keys" ADD COLUMN "rotatedAt" TIMESTAMP(3);
ALTER TABLE "api_keys" ADD COLUMN "rotatedFromId" TEXT;

CREATE INDEX "api_keys_tenantId_rotatedFromId_idx" ON "api_keys"("tenantId", "rotatedFromId");
