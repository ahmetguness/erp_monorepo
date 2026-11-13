ALTER TABLE "payments"
  ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'TRY',
  ADD COLUMN "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1;
ALTER TABLE "payments" ADD CONSTRAINT "payments_currency_snapshot_check"
  CHECK ("currencyCode" ~ '^[A-Z]{3}$' AND "exchangeRate" > 0 AND ("currencyCode" <> 'TRY' OR "exchangeRate" = 1));
