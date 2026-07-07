const PRODUCT_LIMIT_WARNING_RATIO = 0.9;

export const PRODUCT_LIMIT_UPGRADE_HREF =
  "/dashboard/upgrade-preview?feature=Urun%20limiti%20ve%20gelismis%20stok%20kapasitesi&plan=PROFESSIONAL&module=inventory";

export type ProductLimitLevel = "available" | "near" | "full" | "unlimited";

export interface ProductLimitStatus {
  currentCount: number;
  maxProducts: number | null;
  remainingSlots: number | null;
  usageRatio: number | null;
  usagePercent: number | null;
  level: ProductLimitLevel;
  isLimited: boolean;
  isNearLimit: boolean;
  isLimitReached: boolean;
}

export function getProductLimitStatus(
  currentCount: number,
  maxProducts: number | null,
): ProductLimitStatus {
  if (maxProducts === null) {
    return {
      currentCount,
      maxProducts,
      remainingSlots: null,
      usageRatio: null,
      usagePercent: null,
      level: "unlimited",
      isLimited: false,
      isNearLimit: false,
      isLimitReached: false,
    };
  }

  const remainingSlots = Math.max(0, maxProducts - currentCount);
  const usageRatio = maxProducts > 0 ? currentCount / maxProducts : 1;
  const isLimitReached = currentCount >= maxProducts;
  const isNearLimit = !isLimitReached && usageRatio >= PRODUCT_LIMIT_WARNING_RATIO;

  return {
    currentCount,
    maxProducts,
    remainingSlots,
    usageRatio,
    usagePercent: Math.min(100, Math.round(usageRatio * 100)),
    level: isLimitReached ? "full" : isNearLimit ? "near" : "available",
    isLimited: true,
    isNearLimit,
    isLimitReached,
  };
}
