import { PLAN_MODULES, type ModuleKey, type PlanName } from '@repo/types/plans';

export interface TenantModuleAlignment {
  expectedModules: readonly ModuleKey[];
  missingModules: string[];
  extraModules: string[];
  isAligned: boolean;
}

export function getPlanModules(plan: PlanName): string[] {
  return [...PLAN_MODULES[plan]];
}

export function getTenantModuleAlignment(
  plan: PlanName,
  tenantModules: readonly string[],
): TenantModuleAlignment {
  const expectedModules = PLAN_MODULES[plan];
  const expectedModuleSet = new Set<string>(expectedModules);
  const tenantModuleSet = new Set(tenantModules.map((module) => module.toLowerCase()));

  const missingModules = expectedModules.filter((module) => !tenantModuleSet.has(module));
  const extraModules = [...tenantModuleSet].filter((module) => !expectedModuleSet.has(module)).sort();

  return {
    expectedModules,
    missingModules,
    extraModules,
    isAligned: missingModules.length === 0 && extraModules.length === 0,
  };
}
