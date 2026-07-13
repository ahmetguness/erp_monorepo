import { AppModule, Plan } from '@prisma/client';
import { PLAN, PLAN_MODULES, type ModuleKey, type PlanName } from '@repo/types/plans';
import { isModuleInList } from './feature-helpers';

export const MODULE_TO_APP_MODULE: Record<ModuleKey, AppModule> = {
  accounting: AppModule.ACCOUNTING,
  inventory: AppModule.INVENTORY,
  contacts: AppModule.CONTACTS,
  invoicing: AppModule.INVOICING,
  reporting: AppModule.REPORTING,
  purchasing: AppModule.PURCHASING,
  production: AppModule.PRODUCTION,
  service: AppModule.SERVICE,
  marketplace: AppModule.MARKETPLACE,
  payroll: AppModule.PAYROLL,
  hr: AppModule.HR,
  approvals: AppModule.APPROVALS,
  warehouse: AppModule.WAREHOUSE,
  mail: AppModule.MAIL,
  workflow: AppModule.WORKFLOW,
  documents: AppModule.DOCUMENTS,
};

export const VALID_MODULE_KEYS = Object.keys(MODULE_TO_APP_MODULE) as ModuleKey[];

export function toAppModule(module: string): AppModule | null {
  const normalized = module.trim().toLowerCase() as ModuleKey;
  return MODULE_TO_APP_MODULE[normalized] ?? null;
}

export function toAppModules(modules: readonly string[]): AppModule[] {
  return modules.flatMap((module) => {
    const appModule = toAppModule(module);
    return appModule ? [appModule] : [];
  });
}

export function modulesForPlan(plan: PlanName): AppModule[] {
  return PLAN_MODULES[plan].map((module) => MODULE_TO_APP_MODULE[module]);
}

export function planNameFromPrisma(plan: Plan): PlanName {
  switch (plan) {
    case Plan.STARTER:
      return PLAN.STARTER;
    case Plan.PROFESSIONAL:
      return PLAN.PROFESSIONAL;
    case Plan.ENTERPRISE:
      return PLAN.ENTERPRISE;
  }
}

export function modulesForPrismaPlan(plan: Plan): AppModule[] {
  return modulesForPlan(planNameFromPrisma(plan));
}

export function moduleKeysForPrismaPlan(plan: Plan): readonly ModuleKey[] {
  return PLAN_MODULES[planNameFromPrisma(plan)];
}

export function hasTenantModuleAccess(
  tenant: { plan: Plan; modules: readonly string[] },
  module: string,
): boolean {
  const effectiveModules = tenant.modules.length > 0 ? tenant.modules : moduleKeysForPrismaPlan(tenant.plan);
  return isModuleInList(effectiveModules, module);
}

export function appModuleToModuleKey(module: AppModule): ModuleKey {
  return module.toLowerCase() as ModuleKey;
}
