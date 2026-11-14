export type PlanTier = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
export interface UserPermissions { isOwner: boolean; modules: Array<{ module: string; action: string }> }
export interface ToolAccessPolicy { minPlan: PlanTier; module: string; requiredAction?: string; additionalModules?: readonly string[] }
const PLAN_ORDER: Readonly<Record<PlanTier, number>> = { STARTER: 0, PROFESSIONAL: 1, ENTERPRISE: 2 };
const MODULE_ALIASES: Readonly<Record<string, string>> = { crm: 'contacts', sales: 'invoicing' };

export function allowsTool(policy: ToolAccessPolicy, plan: string, permissions: UserPermissions, tenantModules: readonly string[]): boolean {
  if (plan !== 'STARTER' && plan !== 'PROFESSIONAL' && plan !== 'ENTERPRISE') return false;
  if (PLAN_ORDER[plan] < PLAN_ORDER[policy.minPlan]) return false;
  const active = new Set(tenantModules.map((value) => MODULE_ALIASES[value.toLowerCase()] ?? value.toLowerCase()));
  return [policy.module, ...(policy.additionalModules ?? [])].every((module) => active.has(module) && (
    permissions.isOwner || permissions.modules.some((permission) => permission.module === module && permission.action === (module === policy.module ? policy.requiredAction ?? 'READ' : 'READ'))
  ));
}
