import { Plan, TenantStatus } from '@prisma/client';

export function isCriticalTenantPlanChange(currentPlan: Plan, nextPlan: Plan): boolean {
  return currentPlan === Plan.ENTERPRISE || nextPlan === Plan.ENTERPRISE;
}

export function isCriticalTenantStatusChange(status: TenantStatus): boolean {
  return status === TenantStatus.SUSPENDED || status === TenantStatus.CANCELLED;
}
