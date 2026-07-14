export const PLAN = {
    STARTER: 'STARTER',
    PROFESSIONAL: 'PROFESSIONAL',
    ENTERPRISE: 'ENTERPRISE',
};
export const PLAN_RANK = {
    [PLAN.STARTER]: 1,
    [PLAN.PROFESSIONAL]: 2,
    [PLAN.ENTERPRISE]: 3,
};
export const FEATURE_KEY = {
    MAX_USERS: 'MAX_USERS',
    MAX_PRODUCTS: 'MAX_PRODUCTS',
    MULTI_WAREHOUSE: 'MULTI_WAREHOUSE',
    ROLE_MANAGEMENT: 'ROLE_MANAGEMENT',
    APPROVALS: 'APPROVALS',
    CRM: 'CRM',
    SALES: 'SALES',
    PURCHASING: 'PURCHASING',
    PRODUCTION: 'PRODUCTION',
    SERVICE: 'SERVICE',
    MARKETPLACE: 'MARKETPLACE',
    PAYROLL: 'PAYROLL',
    HR: 'HR',
    API_ACCESS: 'API_ACCESS',
    AUDIT_LOG: 'AUDIT_LOG',
    CUSTOM_REPORTING: 'CUSTOM_REPORTING',
    DOCUMENT_CENTER: 'DOCUMENT_CENTER',
    SMART_NOTIFICATIONS: 'SMART_NOTIFICATIONS',
    WORKFLOW_CENTER: 'WORKFLOW_CENTER',
    MAIL_CENTER: 'MAIL_CENTER',
    BULK_OPERATIONS: 'BULK_OPERATIONS',
    CASHFLOW_FORECAST: 'CASHFLOW_FORECAST',
    BANK_RECONCILIATION: 'BANK_RECONCILIATION',
    LOT_SERIAL_TRACKING: 'LOT_SERIAL_TRACKING',
};
export const FEATURE_TYPE = {
    BOOLEAN: 'BOOLEAN',
    LIMIT: 'LIMIT',
    ENUM: 'ENUM',
};
export const MODULE_KEY = {
    ACCOUNTING: 'accounting',
    INVENTORY: 'inventory',
    CONTACTS: 'contacts',
    INVOICING: 'invoicing',
    REPORTING: 'reporting',
    PURCHASING: 'purchasing',
    PRODUCTION: 'production',
    SERVICE: 'service',
    MARKETPLACE: 'marketplace',
    PAYROLL: 'payroll',
    HR: 'hr',
    APPROVALS: 'approvals',
    WAREHOUSE: 'warehouse',
    MAIL: 'mail',
    WORKFLOW: 'workflow',
    DOCUMENTS: 'documents',
};
export const STARTER_OPEN_MODULES = [
    MODULE_KEY.ACCOUNTING,
    MODULE_KEY.INVENTORY,
    MODULE_KEY.CONTACTS,
    MODULE_KEY.INVOICING,
    MODULE_KEY.REPORTING,
    MODULE_KEY.DOCUMENTS,
];
export const PLAN_FEATURES = {
    [PLAN.STARTER]: {
        maxUsers: 5,
        maxProducts: 500,
        multiWarehouse: false,
        roleManagement: false,
        approvals: false,
        crm: true,
        sales: true,
        purchasing: false,
        production: false,
        service: false,
        marketplace: false,
        payroll: false,
        hr: false,
        apiAccess: false,
        advancedAuditLog: false,
        customReporting: false,
        documentCenter: true,
        smartNotifications: true,
        workflowCenter: false,
        mailCenter: false,
        bulkOperations: false,
        cashflowForecast: false,
        bankReconciliation: false,
        lotSerialTracking: false,
    },
    [PLAN.PROFESSIONAL]: {
        maxUsers: 25,
        maxProducts: 5000,
        multiWarehouse: true,
        roleManagement: true,
        approvals: true,
        crm: true,
        sales: true,
        purchasing: true,
        production: false,
        service: false,
        marketplace: false,
        payroll: false,
        hr: false,
        apiAccess: true,
        advancedAuditLog: true,
        customReporting: true,
        documentCenter: true,
        smartNotifications: true,
        workflowCenter: true,
        mailCenter: false,
        bulkOperations: true,
        cashflowForecast: true,
        bankReconciliation: true,
        lotSerialTracking: true,
    },
    [PLAN.ENTERPRISE]: {
        maxUsers: null,
        maxProducts: null,
        multiWarehouse: true,
        roleManagement: true,
        approvals: true,
        crm: true,
        sales: true,
        purchasing: true,
        production: true,
        service: true,
        marketplace: true,
        payroll: true,
        hr: true,
        apiAccess: true,
        advancedAuditLog: true,
        customReporting: true,
        documentCenter: true,
        smartNotifications: true,
        workflowCenter: true,
        mailCenter: true,
        bulkOperations: true,
        cashflowForecast: true,
        bankReconciliation: true,
        lotSerialTracking: true,
    },
};
export const PLAN_MODULES = {
    [PLAN.STARTER]: [
        MODULE_KEY.ACCOUNTING,
        MODULE_KEY.INVENTORY,
        MODULE_KEY.CONTACTS,
        MODULE_KEY.INVOICING,
        MODULE_KEY.REPORTING,
        MODULE_KEY.DOCUMENTS,
    ],
    [PLAN.PROFESSIONAL]: [
        MODULE_KEY.ACCOUNTING,
        MODULE_KEY.INVENTORY,
        MODULE_KEY.CONTACTS,
        MODULE_KEY.INVOICING,
        MODULE_KEY.REPORTING,
        MODULE_KEY.DOCUMENTS,
        MODULE_KEY.PURCHASING,
        MODULE_KEY.APPROVALS,
        MODULE_KEY.WAREHOUSE,
        MODULE_KEY.WORKFLOW,
    ],
    [PLAN.ENTERPRISE]: [
        MODULE_KEY.ACCOUNTING,
        MODULE_KEY.INVENTORY,
        MODULE_KEY.CONTACTS,
        MODULE_KEY.INVOICING,
        MODULE_KEY.REPORTING,
        MODULE_KEY.DOCUMENTS,
        MODULE_KEY.PURCHASING,
        MODULE_KEY.APPROVALS,
        MODULE_KEY.WAREHOUSE,
        MODULE_KEY.WORKFLOW,
        MODULE_KEY.PRODUCTION,
        MODULE_KEY.SERVICE,
        MODULE_KEY.MARKETPLACE,
        MODULE_KEY.HR,
        MODULE_KEY.PAYROLL,
        MODULE_KEY.MAIL,
    ],
};
const PLAN_ORDER = [PLAN.STARTER, PLAN.PROFESSIONAL, PLAN.ENTERPRISE];
function serializeBoolean(value) {
    return value ? 'true' : 'false';
}
function serializeLimit(value) {
    return value === null ? 'unlimited' : String(value);
}
function booleanFeature(flag, key, featureKey, label, pricingVisible = true) {
    return {
        flag,
        key,
        featureKey,
        type: FEATURE_TYPE.BOOLEAN,
        label,
        pricingVisible,
        value: (features) => serializeBoolean(features[flag]),
    };
}
function limitFeature(flag, key, featureKey, label, pricingVisible = true) {
    return {
        flag,
        key,
        featureKey,
        type: FEATURE_TYPE.LIMIT,
        label,
        pricingVisible,
        value: (features) => serializeLimit(features[flag]),
    };
}
export const PLAN_FEATURE_DEFINITIONS = [
    limitFeature('maxUsers', 'max_users', FEATURE_KEY.MAX_USERS, 'Maksimum kullanici'),
    limitFeature('maxProducts', 'max_products', FEATURE_KEY.MAX_PRODUCTS, 'Maksimum urun'),
    booleanFeature('multiWarehouse', 'multi_warehouse', FEATURE_KEY.MULTI_WAREHOUSE, 'Coklu depo'),
    booleanFeature('roleManagement', 'role_management', FEATURE_KEY.ROLE_MANAGEMENT, 'Rol yonetimi'),
    booleanFeature('approvals', 'approvals', FEATURE_KEY.APPROVALS, 'Onay akislari'),
    booleanFeature('crm', 'crm', FEATURE_KEY.CRM, 'CRM'),
    booleanFeature('sales', 'sales', FEATURE_KEY.SALES, 'Satis'),
    booleanFeature('purchasing', 'purchasing', FEATURE_KEY.PURCHASING, 'Satin alma'),
    booleanFeature('production', 'production', FEATURE_KEY.PRODUCTION, 'Uretim'),
    booleanFeature('service', 'service', FEATURE_KEY.SERVICE, 'Teknik servis'),
    booleanFeature('marketplace', 'marketplace', FEATURE_KEY.MARKETPLACE, 'Pazaryeri'),
    booleanFeature('payroll', 'payroll', FEATURE_KEY.PAYROLL, 'Bordro'),
    booleanFeature('hr', 'hr', FEATURE_KEY.HR, 'Insan kaynaklari'),
    booleanFeature('apiAccess', 'api_access', FEATURE_KEY.API_ACCESS, 'API erisimi'),
    {
        flag: 'advancedAuditLog',
        key: 'audit_log',
        featureKey: FEATURE_KEY.AUDIT_LOG,
        type: FEATURE_TYPE.ENUM,
        label: 'Audit log',
        pricingVisible: true,
        value: (features, plan) => {
            if (!features.advancedAuditLog)
                return 'basic';
            return plan === PLAN.ENTERPRISE ? 'full' : 'standard';
        },
    },
    booleanFeature('customReporting', 'custom_reporting', FEATURE_KEY.CUSTOM_REPORTING, 'Ozel raporlama'),
    booleanFeature('documentCenter', 'document_center', FEATURE_KEY.DOCUMENT_CENTER, 'Dokuman merkezi'),
    booleanFeature('smartNotifications', 'smart_notifications', FEATURE_KEY.SMART_NOTIFICATIONS, 'Akilli bildirimler'),
    booleanFeature('workflowCenter', 'workflow_center', FEATURE_KEY.WORKFLOW_CENTER, 'Is akisi merkezi'),
    booleanFeature('mailCenter', 'mail_center', FEATURE_KEY.MAIL_CENTER, 'Mail merkezi'),
    booleanFeature('bulkOperations', 'bulk_operations', FEATURE_KEY.BULK_OPERATIONS, 'Toplu islemler'),
    booleanFeature('cashflowForecast', 'cashflow_forecast', FEATURE_KEY.CASHFLOW_FORECAST, 'Nakit akisi tahmini'),
    booleanFeature('bankReconciliation', 'bank_reconciliation', FEATURE_KEY.BANK_RECONCILIATION, 'Banka mutabakati'),
    booleanFeature('lotSerialTracking', 'lot_serial_tracking', FEATURE_KEY.LOT_SERIAL_TRACKING, 'Lot / seri no takibi'),
];
const PLAN_FEATURE_DEFINITION_COVERAGE = {};
void PLAN_FEATURE_DEFINITION_COVERAGE;
export const PLAN_FEATURE_ROWS = PLAN_ORDER.flatMap((plan) => {
    const features = PLAN_FEATURES[plan];
    return PLAN_FEATURE_DEFINITIONS.map((definition) => ({
        plan,
        key: definition.key,
        featureKey: definition.featureKey,
        value: definition.value(features, plan),
        type: definition.type,
    }));
});
export const PLAN_LABELS = {
    [PLAN.STARTER]: 'Starter',
    [PLAN.PROFESSIONAL]: 'Professional',
    [PLAN.ENTERPRISE]: 'Enterprise',
};
export const PLAN_PRICING_META = {
    [PLAN.STARTER]: {
        label: PLAN_LABELS.STARTER,
        badge: null,
        price: '1.990',
        priceSub: null,
        description: 'Temel operasyonel surecleri dijitallestirmek isteyen kucuk olcekli isletmeler icin.',
        cta: 'Hemen Basla',
        ctaStyle: 'secondary',
        highlight: false,
    },
    [PLAN.PROFESSIONAL]: {
        label: PLAN_LABELS.PROFESSIONAL,
        badge: 'Onerilen',
        price: '3.990',
        priceSub: '+ kullanici basi 150 TL/ay',
        description: 'Satis, finans ve operasyon sureclerini tek cati altinda yonetmek isteyen buyuyen isletmeler icin.',
        cta: 'Lisans Satin Al',
        ctaStyle: 'primary',
        highlight: true,
    },
    [PLAN.ENTERPRISE]: {
        label: PLAN_LABELS.ENTERPRISE,
        badge: null,
        price: null,
        priceSub: null,
        description: 'Cok subeli, yuksek kullanicili ve ozel entegrasyon gerektiren kurumlar icin.',
        cta: 'Satis Ekibiyle Gorus',
        ctaStyle: 'outline',
        highlight: false,
    },
};
function formatPricingFeatureValue(definition, value) {
    if (definition.type === FEATURE_TYPE.BOOLEAN)
        return value === 'true' ? definition.label : null;
    if (value === 'unlimited')
        return `Sinirsiz ${definition.label.toLocaleLowerCase('tr-TR')}`;
    return `${value} ${definition.label.toLocaleLowerCase('tr-TR')}`;
}
export const PLAN_PRICING_MATRIX = PLAN_ORDER.map((plan) => {
    const features = PLAN_FEATURE_DEFINITIONS.flatMap((definition) => {
        if (!definition.pricingVisible)
            return [];
        const value = definition.value(PLAN_FEATURES[plan], plan);
        const label = formatPricingFeatureValue(definition, value);
        return label ? [{ key: definition.key, label, value }] : [];
    });
    return {
        plan,
        meta: PLAN_PRICING_META[plan],
        features,
    };
});
export const ACCESS_POLICIES = {
    purchasing: { minPlan: PLAN.PROFESSIONAL, featureKey: FEATURE_KEY.PURCHASING, module: MODULE_KEY.PURCHASING },
    approvals: { minPlan: PLAN.PROFESSIONAL, featureKey: FEATURE_KEY.APPROVALS, module: MODULE_KEY.APPROVALS },
    apiKeys: { minPlan: PLAN.PROFESSIONAL, featureKey: FEATURE_KEY.API_ACCESS },
    roles: { minPlan: PLAN.PROFESSIONAL, featureKey: FEATURE_KEY.ROLE_MANAGEMENT },
    deliveryNotes: { minPlan: PLAN.PROFESSIONAL, module: MODULE_KEY.INVOICING },
    documentCenter: { minPlan: PLAN.STARTER, featureKey: FEATURE_KEY.DOCUMENT_CENTER, module: MODULE_KEY.DOCUMENTS },
    smartNotifications: { minPlan: PLAN.STARTER, featureKey: FEATURE_KEY.SMART_NOTIFICATIONS },
    smartNotificationExternalActions: { minPlan: PLAN.PROFESSIONAL, featureKey: FEATURE_KEY.SMART_NOTIFICATIONS },
    eDocuments: { minPlan: PLAN.STARTER, module: MODULE_KEY.INVOICING },
    bankTransactions: { minPlan: PLAN.PROFESSIONAL, module: MODULE_KEY.ACCOUNTING },
    checkPromissory: { minPlan: PLAN.PROFESSIONAL, module: MODULE_KEY.ACCOUNTING },
    reconciliations: { minPlan: PLAN.PROFESSIONAL, featureKey: FEATURE_KEY.BANK_RECONCILIATION, module: MODULE_KEY.ACCOUNTING },
    stockValuations: { minPlan: PLAN.PROFESSIONAL, module: MODULE_KEY.INVENTORY },
    reservations: { minPlan: PLAN.PROFESSIONAL, module: MODULE_KEY.INVENTORY },
    productBatches: { minPlan: PLAN.PROFESSIONAL, module: MODULE_KEY.INVENTORY },
    lotSerials: { minPlan: PLAN.PROFESSIONAL, featureKey: FEATURE_KEY.LOT_SERIAL_TRACKING, module: MODULE_KEY.INVENTORY },
    bulkOperations: { minPlan: PLAN.PROFESSIONAL, featureKey: FEATURE_KEY.BULK_OPERATIONS },
    advancedStockSuggestions: { minPlan: PLAN.PROFESSIONAL, module: MODULE_KEY.INVENTORY },
    auditLogExport: { minPlan: PLAN.PROFESSIONAL, featureKey: FEATURE_KEY.AUDIT_LOG },
    cashflowForecast: { minPlan: PLAN.PROFESSIONAL, featureKey: FEATURE_KEY.CASHFLOW_FORECAST, module: MODULE_KEY.REPORTING },
    supplierPerformance: { minPlan: PLAN.PROFESSIONAL, featureKey: FEATURE_KEY.PURCHASING, module: MODULE_KEY.PURCHASING },
    workflowAutomation: { minPlan: PLAN.PROFESSIONAL, featureKey: FEATURE_KEY.WORKFLOW_CENTER, module: MODULE_KEY.WORKFLOW },
    production: { minPlan: PLAN.ENTERPRISE, featureKey: FEATURE_KEY.PRODUCTION, module: MODULE_KEY.PRODUCTION },
    service: { minPlan: PLAN.ENTERPRISE, featureKey: FEATURE_KEY.SERVICE, module: MODULE_KEY.SERVICE },
    marketplace: { minPlan: PLAN.ENTERPRISE, featureKey: FEATURE_KEY.MARKETPLACE, module: MODULE_KEY.MARKETPLACE },
    b2bIntegrations: { minPlan: PLAN.ENTERPRISE, featureKey: FEATURE_KEY.MARKETPLACE, module: MODULE_KEY.MARKETPLACE },
    hr: { minPlan: PLAN.ENTERPRISE, featureKey: FEATURE_KEY.HR, module: MODULE_KEY.HR },
    payroll: { minPlan: PLAN.ENTERPRISE, featureKey: FEATURE_KEY.PAYROLL, module: MODULE_KEY.PAYROLL },
    mail: { minPlan: PLAN.ENTERPRISE, featureKey: FEATURE_KEY.MAIL_CENTER, module: MODULE_KEY.MAIL },
    chat: { minPlan: PLAN.ENTERPRISE },
    aiGovernance: { minPlan: PLAN.ENTERPRISE },
};
export function isPlanAtLeast(currentPlan, requiredPlan) {
    return PLAN_RANK[currentPlan] >= PLAN_RANK[requiredPlan];
}
export function normalizeModuleKey(module) {
    return String(module).toLowerCase();
}
