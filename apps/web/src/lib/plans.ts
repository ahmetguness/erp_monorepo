import {
  ACCESS_POLICIES,
  PLAN,
  PLAN_FEATURES,
  PLAN_RANK,
} from '@repo/types/plans';

export { ACCESS_POLICIES, PLAN, PLAN_FEATURES, PLAN_RANK };

export type PlanName = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

export type ModuleKey =
  | 'accounting'
  | 'inventory'
  | 'contacts'
  | 'invoicing'
  | 'reporting'
  | 'purchasing'
  | 'production'
  | 'service'
  | 'marketplace'
  | 'payroll'
  | 'hr'
  | 'approvals'
  | 'warehouse'
  | 'mail'
  | 'workflow'
  | 'documents';

export interface PlanFeatureFlags {
  maxUsers: number | null;
  maxProducts: number | null;
  multiWarehouse: boolean;
  roleManagement: boolean;
  approvals: boolean;
  crm: boolean;
  sales: boolean;
  purchasing: boolean;
  production: boolean;
  service: boolean;
  marketplace: boolean;
  payroll: boolean;
  hr: boolean;
  apiAccess: boolean;
  advancedAuditLog: boolean;
  customReporting: boolean;
  documentCenter: boolean;
  smartNotifications: boolean;
  workflowCenter: boolean;
  mailCenter: boolean;
}
