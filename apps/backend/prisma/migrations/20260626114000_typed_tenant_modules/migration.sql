ALTER TYPE "AppModule" ADD VALUE IF NOT EXISTS 'MAIL';
ALTER TYPE "AppModule" ADD VALUE IF NOT EXISTS 'WORKFLOW';
ALTER TYPE "AppModule" ADD VALUE IF NOT EXISTS 'DOCUMENTS';

ALTER TABLE "tenants"
  ADD COLUMN "modules_typed" "AppModule"[] NOT NULL DEFAULT ARRAY[]::"AppModule"[];

UPDATE "tenants"
SET "modules_typed" = COALESCE(
  (
    SELECT array_agg(UPPER(module_value)::"AppModule")
    FROM unnest("modules") AS module_value
    WHERE module_value IS NOT NULL
      AND module_value <> ''
      AND EXISTS (
        SELECT 1
        FROM unnest(enum_range(NULL::"AppModule")) AS enum_value
        WHERE enum_value::text = UPPER(module_value)
      )
  ),
  ARRAY[]::"AppModule"[]
);

ALTER TABLE "tenants" DROP COLUMN "modules";
ALTER TABLE "tenants" RENAME COLUMN "modules_typed" TO "modules";
