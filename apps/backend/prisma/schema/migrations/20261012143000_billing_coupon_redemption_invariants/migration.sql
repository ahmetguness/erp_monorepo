ALTER TABLE "billing_coupons"
  ADD CONSTRAINT "billing_coupons_max_redemptions_positive_check"
    CHECK ("maxRedemptions" IS NULL OR "maxRedemptions" > 0),
  ADD CONSTRAINT "billing_coupons_redemption_count_nonnegative_check"
    CHECK ("redemptionCount" >= 0),
  ADD CONSTRAINT "billing_coupons_redemption_within_limit_check"
    CHECK ("maxRedemptions" IS NULL OR "redemptionCount" <= "maxRedemptions");
