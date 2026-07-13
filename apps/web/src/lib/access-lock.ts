import { PLAN_RANK, type PlanName } from '@/lib/plans';

export type AccessLockReasonCode = 'plan' | 'module' | 'feature' | 'limit';

export interface AccessLockReason {
  code: AccessLockReasonCode;
  label: string;
  description: string;
}

export interface AccessLockInput {
  currentPlan: PlanName;
  requiredPlan?: PlanName;
  requiredModule?: string;
  tenantModules?: readonly string[] | null;
  featureAllowed?: boolean;
  featureLabel?: string;
  limitReached?: boolean;
  limitLabel?: string;
}

export function hasRequiredPlan(currentPlan: PlanName, requiredPlan?: PlanName): boolean {
  if (!requiredPlan) return true;
  return PLAN_RANK[currentPlan] >= PLAN_RANK[requiredPlan];
}

export function hasRequiredModule(tenantModules: readonly string[] | undefined | null, requiredModule?: string): boolean {
  if (!requiredModule) return true;
  if (!tenantModules || tenantModules.length === 0) return true;

  const normalized = tenantModules.map((module) => module.toLowerCase());
  const required = requiredModule.toLowerCase();

  if (required === 'sales') return normalized.includes('sales') || normalized.includes('invoicing') || normalized.includes('contacts');
  if (required === 'inventory') return normalized.includes('inventory') || normalized.includes('warehouse');
  if (required === 'mail') return normalized.includes('mail') || normalized.includes('mailcenter');
  return normalized.includes(required);
}

export function getAccessLockReasons(input: AccessLockInput): AccessLockReason[] {
  const reasons: AccessLockReason[] = [];

  if (!hasRequiredPlan(input.currentPlan, input.requiredPlan)) {
    reasons.push({
      code: 'plan',
      label: 'Plan yetersiz',
      description: `En az ${input.requiredPlan} plani gerekir.`,
    });
  }

  if (!hasRequiredModule(input.tenantModules, input.requiredModule)) {
    reasons.push({
      code: 'module',
      label: 'Modul kapali',
      description: `${input.requiredModule} modulu tenant icin aktif degil.`,
    });
  }

  if (input.featureAllowed === false) {
    reasons.push({
      code: 'feature',
      label: 'Feature kapali',
      description: `${input.featureLabel ?? 'Bu feature'} plan matrisi veya tenant override ile kapali.`,
    });
  }

  if (input.limitReached) {
    reasons.push({
      code: 'limit',
      label: 'Limit dolu',
      description: `${input.limitLabel ?? 'Paket limiti'} doldu.`,
    });
  }

  return reasons;
}

export function lockReasonSummary(reasons: readonly AccessLockReason[]): string {
  if (reasons.length === 0) return 'Erisim acik';
  return reasons.map((reason) => reason.label).join(', ');
}
