import { AppModule } from '@prisma/client';
import { PLAN_MODULES, type ModuleKey, type PlanName } from '@repo/types/plans';

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

export function appModuleToModuleKey(module: AppModule): ModuleKey {
  return module.toLowerCase() as ModuleKey;
}
