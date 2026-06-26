import { Plan, TenantStatus } from '@prisma/client';
import { PLAN_RANK } from '@repo/types/plans';

export { Plan, TenantStatus };

// ─────────────────────────────────────────────
// Plan Types
// ─────────────────────────────────────────────

export interface PlanContext {
  tenantId: string;
  plan: Plan;
  status: TenantStatus;
}

export interface PlanLimits {
  maxUsers: number | null;
  maxProducts: number | null;
  multiWarehouse: boolean;
}

export const PLAN_HIERARCHY: Record<Plan, number> = {
  [Plan.STARTER]: PLAN_RANK.STARTER,
  [Plan.PROFESSIONAL]: PLAN_RANK.PROFESSIONAL,
  [Plan.ENTERPRISE]: PLAN_RANK.ENTERPRISE,
};

/**
 * Verilen planın hedef plandan büyük veya eşit olup olmadığını kontrol eder.
 */
export function isPlanAtLeast(current: Plan, required: Plan): boolean {
  return PLAN_HIERARCHY[current] >= PLAN_HIERARCHY[required];
}
