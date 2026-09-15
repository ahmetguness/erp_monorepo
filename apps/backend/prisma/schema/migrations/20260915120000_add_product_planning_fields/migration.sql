ALTER TABLE "products"
ADD COLUMN "safetyStock" DECIMAL(18,3),
ADD COLUMN "reorderPoint" DECIMAL(18,3),
ADD COLUMN "reorderQty" DECIMAL(18,3),
ADD COLUMN "leadTimeDays" INTEGER;
