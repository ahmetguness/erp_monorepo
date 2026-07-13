export declare const PLAN: {
    readonly STARTER: "STARTER";
    readonly PROFESSIONAL: "PROFESSIONAL";
    readonly ENTERPRISE: "ENTERPRISE";
};
export type PlanName = typeof PLAN[keyof typeof PLAN];
export declare const PLAN_RANK: Record<PlanName, number>;
export declare const FEATURE_KEY: {
    readonly MAX_USERS: "MAX_USERS";
    readonly MAX_PRODUCTS: "MAX_PRODUCTS";
    readonly MULTI_WAREHOUSE: "MULTI_WAREHOUSE";
    readonly ROLE_MANAGEMENT: "ROLE_MANAGEMENT";
    readonly APPROVALS: "APPROVALS";
    readonly CRM: "CRM";
    readonly SALES: "SALES";
    readonly PURCHASING: "PURCHASING";
    readonly PRODUCTION: "PRODUCTION";
    readonly SERVICE: "SERVICE";
    readonly MARKETPLACE: "MARKETPLACE";
    readonly PAYROLL: "PAYROLL";
    readonly HR: "HR";
    readonly API_ACCESS: "API_ACCESS";
    readonly AUDIT_LOG: "AUDIT_LOG";
    readonly CUSTOM_REPORTING: "CUSTOM_REPORTING";
    readonly DOCUMENT_CENTER: "DOCUMENT_CENTER";
    readonly SMART_NOTIFICATIONS: "SMART_NOTIFICATIONS";
    readonly WORKFLOW_CENTER: "WORKFLOW_CENTER";
    readonly MAIL_CENTER: "MAIL_CENTER";
    readonly BULK_OPERATIONS: "BULK_OPERATIONS";
    readonly CASHFLOW_FORECAST: "CASHFLOW_FORECAST";
    readonly BANK_RECONCILIATION: "BANK_RECONCILIATION";
    readonly LOT_SERIAL_TRACKING: "LOT_SERIAL_TRACKING";
};
export type FeatureKeyName = typeof FEATURE_KEY[keyof typeof FEATURE_KEY];
export declare const FEATURE_TYPE: {
    readonly BOOLEAN: "BOOLEAN";
    readonly LIMIT: "LIMIT";
    readonly ENUM: "ENUM";
};
export type FeatureTypeName = typeof FEATURE_TYPE[keyof typeof FEATURE_TYPE];
export declare const MODULE_KEY: {
    readonly ACCOUNTING: "accounting";
    readonly INVENTORY: "inventory";
    readonly CONTACTS: "contacts";
    readonly INVOICING: "invoicing";
    readonly REPORTING: "reporting";
    readonly PURCHASING: "purchasing";
    readonly PRODUCTION: "production";
    readonly SERVICE: "service";
    readonly MARKETPLACE: "marketplace";
    readonly PAYROLL: "payroll";
    readonly HR: "hr";
    readonly APPROVALS: "approvals";
    readonly WAREHOUSE: "warehouse";
    readonly MAIL: "mail";
    readonly WORKFLOW: "workflow";
    readonly DOCUMENTS: "documents";
};
export type ModuleKey = typeof MODULE_KEY[keyof typeof MODULE_KEY];
export declare const STARTER_OPEN_MODULES: readonly ModuleKey[];
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
    bulkOperations: boolean;
    cashflowForecast: boolean;
    bankReconciliation: boolean;
    lotSerialTracking: boolean;
}
export declare const PLAN_FEATURES: Record<PlanName, PlanFeatureFlags>;
export declare const PLAN_MODULES: Record<PlanName, readonly ModuleKey[]>;
export interface PlanFeatureRow {
    plan: PlanName;
    key: string;
    featureKey: FeatureKeyName;
    value: string;
    type: FeatureTypeName;
}
export interface PlanFeatureDefinition {
    flag: keyof PlanFeatureFlags;
    key: string;
    featureKey: FeatureKeyName;
    type: FeatureTypeName;
    value: (features: PlanFeatureFlags, plan: PlanName) => string;
}
export declare const PLAN_FEATURE_DEFINITIONS: readonly PlanFeatureDefinition[];
export declare const PLAN_FEATURE_ROWS: readonly PlanFeatureRow[];
export interface AccessPolicy {
    minPlan?: PlanName;
    featureKey?: FeatureKeyName;
    module?: ModuleKey;
}
export declare const ACCESS_POLICIES: Record<string, AccessPolicy>;
export declare function isPlanAtLeast(currentPlan: PlanName, requiredPlan: PlanName): boolean;
export declare function normalizeModuleKey(module: string): string;
