"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACCESS_POLICIES = exports.PLAN_PRICING_MATRIX = exports.PLAN_PRICING_META = exports.PLAN_LABELS = exports.PLAN_FEATURE_ROWS = exports.PLAN_FEATURE_DEFINITIONS = exports.PLAN_MODULES = exports.PLAN_FEATURES = exports.STARTER_OPEN_MODULES = exports.MODULE_KEY = exports.FEATURE_TYPE = exports.FEATURE_KEY = exports.PLAN_RANK = exports.PLAN = void 0;
exports.isPlanAtLeast = isPlanAtLeast;
exports.normalizeModuleKey = normalizeModuleKey;
exports.PLAN = {
    STARTER: 'STARTER',
    PROFESSIONAL: 'PROFESSIONAL',
    ENTERPRISE: 'ENTERPRISE',
};
exports.PLAN_RANK = {
    [exports.PLAN.STARTER]: 1,
    [exports.PLAN.PROFESSIONAL]: 2,
    [exports.PLAN.ENTERPRISE]: 3,
};
exports.FEATURE_KEY = {
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
exports.FEATURE_TYPE = {
    BOOLEAN: 'BOOLEAN',
    LIMIT: 'LIMIT',
    ENUM: 'ENUM',
};
exports.MODULE_KEY = {
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
exports.STARTER_OPEN_MODULES = [
    exports.MODULE_KEY.ACCOUNTING,
    exports.MODULE_KEY.INVENTORY,
    exports.MODULE_KEY.CONTACTS,
    exports.MODULE_KEY.INVOICING,
    exports.MODULE_KEY.REPORTING,
    exports.MODULE_KEY.DOCUMENTS,
];
exports.PLAN_FEATURES = {
    [exports.PLAN.STARTER]: {
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
    [exports.PLAN.PROFESSIONAL]: {
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
    [exports.PLAN.ENTERPRISE]: {
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
exports.PLAN_MODULES = {
    [exports.PLAN.STARTER]: [
        exports.MODULE_KEY.ACCOUNTING,
        exports.MODULE_KEY.INVENTORY,
        exports.MODULE_KEY.CONTACTS,
        exports.MODULE_KEY.INVOICING,
        exports.MODULE_KEY.REPORTING,
        exports.MODULE_KEY.DOCUMENTS,
    ],
    [exports.PLAN.PROFESSIONAL]: [
        exports.MODULE_KEY.ACCOUNTING,
        exports.MODULE_KEY.INVENTORY,
        exports.MODULE_KEY.CONTACTS,
        exports.MODULE_KEY.INVOICING,
        exports.MODULE_KEY.REPORTING,
        exports.MODULE_KEY.DOCUMENTS,
        exports.MODULE_KEY.PURCHASING,
        exports.MODULE_KEY.APPROVALS,
        exports.MODULE_KEY.WAREHOUSE,
        exports.MODULE_KEY.WORKFLOW,
    ],
    [exports.PLAN.ENTERPRISE]: [
        exports.MODULE_KEY.ACCOUNTING,
        exports.MODULE_KEY.INVENTORY,
        exports.MODULE_KEY.CONTACTS,
        exports.MODULE_KEY.INVOICING,
        exports.MODULE_KEY.REPORTING,
        exports.MODULE_KEY.DOCUMENTS,
        exports.MODULE_KEY.PURCHASING,
        exports.MODULE_KEY.APPROVALS,
        exports.MODULE_KEY.WAREHOUSE,
        exports.MODULE_KEY.WORKFLOW,
        exports.MODULE_KEY.PRODUCTION,
        exports.MODULE_KEY.SERVICE,
        exports.MODULE_KEY.MARKETPLACE,
        exports.MODULE_KEY.HR,
        exports.MODULE_KEY.PAYROLL,
        exports.MODULE_KEY.MAIL,
    ],
};
const PLAN_ORDER = [exports.PLAN.STARTER, exports.PLAN.PROFESSIONAL, exports.PLAN.ENTERPRISE];
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
        type: exports.FEATURE_TYPE.BOOLEAN,
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
        type: exports.FEATURE_TYPE.LIMIT,
        label,
        pricingVisible,
        value: (features) => serializeLimit(features[flag]),
    };
}
exports.PLAN_FEATURE_DEFINITIONS = [
    limitFeature('maxUsers', 'max_users', exports.FEATURE_KEY.MAX_USERS, 'Maksimum kullanici'),
    limitFeature('maxProducts', 'max_products', exports.FEATURE_KEY.MAX_PRODUCTS, 'Maksimum urun'),
    booleanFeature('multiWarehouse', 'multi_warehouse', exports.FEATURE_KEY.MULTI_WAREHOUSE, 'Coklu depo'),
    booleanFeature('roleManagement', 'role_management', exports.FEATURE_KEY.ROLE_MANAGEMENT, 'Rol yonetimi'),
    booleanFeature('approvals', 'approvals', exports.FEATURE_KEY.APPROVALS, 'Onay akislari'),
    booleanFeature('crm', 'crm', exports.FEATURE_KEY.CRM, 'CRM'),
    booleanFeature('sales', 'sales', exports.FEATURE_KEY.SALES, 'Satis'),
    booleanFeature('purchasing', 'purchasing', exports.FEATURE_KEY.PURCHASING, 'Satin alma'),
    booleanFeature('production', 'production', exports.FEATURE_KEY.PRODUCTION, 'Uretim'),
    booleanFeature('service', 'service', exports.FEATURE_KEY.SERVICE, 'Teknik servis'),
    booleanFeature('marketplace', 'marketplace', exports.FEATURE_KEY.MARKETPLACE, 'Pazaryeri'),
    booleanFeature('payroll', 'payroll', exports.FEATURE_KEY.PAYROLL, 'Bordro'),
    booleanFeature('hr', 'hr', exports.FEATURE_KEY.HR, 'Insan kaynaklari'),
    booleanFeature('apiAccess', 'api_access', exports.FEATURE_KEY.API_ACCESS, 'API erisimi'),
    {
        flag: 'advancedAuditLog',
        key: 'audit_log',
        featureKey: exports.FEATURE_KEY.AUDIT_LOG,
        type: exports.FEATURE_TYPE.ENUM,
        label: 'Audit log',
        pricingVisible: true,
        value: (features, plan) => {
            if (!features.advancedAuditLog)
                return 'basic';
            return plan === exports.PLAN.ENTERPRISE ? 'full' : 'standard';
        },
    },
    booleanFeature('customReporting', 'custom_reporting', exports.FEATURE_KEY.CUSTOM_REPORTING, 'Ozel raporlama'),
    booleanFeature('documentCenter', 'document_center', exports.FEATURE_KEY.DOCUMENT_CENTER, 'Dokuman merkezi'),
    booleanFeature('smartNotifications', 'smart_notifications', exports.FEATURE_KEY.SMART_NOTIFICATIONS, 'Akilli bildirimler'),
    booleanFeature('workflowCenter', 'workflow_center', exports.FEATURE_KEY.WORKFLOW_CENTER, 'Is akisi merkezi'),
    booleanFeature('mailCenter', 'mail_center', exports.FEATURE_KEY.MAIL_CENTER, 'Mail merkezi'),
    booleanFeature('bulkOperations', 'bulk_operations', exports.FEATURE_KEY.BULK_OPERATIONS, 'Toplu islemler'),
    booleanFeature('cashflowForecast', 'cashflow_forecast', exports.FEATURE_KEY.CASHFLOW_FORECAST, 'Nakit akisi tahmini'),
    booleanFeature('bankReconciliation', 'bank_reconciliation', exports.FEATURE_KEY.BANK_RECONCILIATION, 'Banka mutabakati'),
    booleanFeature('lotSerialTracking', 'lot_serial_tracking', exports.FEATURE_KEY.LOT_SERIAL_TRACKING, 'Lot / seri no takibi'),
];
const PLAN_FEATURE_DEFINITION_COVERAGE = {};
void PLAN_FEATURE_DEFINITION_COVERAGE;
exports.PLAN_FEATURE_ROWS = PLAN_ORDER.flatMap((plan) => {
    const features = exports.PLAN_FEATURES[plan];
    return exports.PLAN_FEATURE_DEFINITIONS.map((definition) => ({
        plan,
        key: definition.key,
        featureKey: definition.featureKey,
        value: definition.value(features, plan),
        type: definition.type,
    }));
});
exports.PLAN_LABELS = {
    [exports.PLAN.STARTER]: 'Starter',
    [exports.PLAN.PROFESSIONAL]: 'Professional',
    [exports.PLAN.ENTERPRISE]: 'Enterprise',
};
exports.PLAN_PRICING_META = {
    [exports.PLAN.STARTER]: {
        label: exports.PLAN_LABELS.STARTER,
        badge: null,
        price: '1.990',
        priceSub: null,
        description: 'Temel operasyonel surecleri dijitallestirmek isteyen kucuk olcekli isletmeler icin.',
        cta: 'Hemen Basla',
        ctaStyle: 'secondary',
        highlight: false,
    },
    [exports.PLAN.PROFESSIONAL]: {
        label: exports.PLAN_LABELS.PROFESSIONAL,
        badge: 'Onerilen',
        price: '3.990',
        priceSub: '+ kullanici basi 150 TL/ay',
        description: 'Satis, finans ve operasyon sureclerini tek cati altinda yonetmek isteyen buyuyen isletmeler icin.',
        cta: 'Lisans Satin Al',
        ctaStyle: 'primary',
        highlight: true,
    },
    [exports.PLAN.ENTERPRISE]: {
        label: exports.PLAN_LABELS.ENTERPRISE,
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
    if (definition.type === exports.FEATURE_TYPE.BOOLEAN)
        return value === 'true' ? definition.label : null;
    if (value === 'unlimited')
        return `Sinirsiz ${definition.label.toLocaleLowerCase('tr-TR')}`;
    return `${value} ${definition.label.toLocaleLowerCase('tr-TR')}`;
}
exports.PLAN_PRICING_MATRIX = PLAN_ORDER.map((plan) => {
    const features = exports.PLAN_FEATURE_DEFINITIONS.flatMap((definition) => {
        if (!definition.pricingVisible)
            return [];
        const value = definition.value(exports.PLAN_FEATURES[plan], plan);
        const label = formatPricingFeatureValue(definition, value);
        return label ? [{ key: definition.key, label, value }] : [];
    });
    return {
        plan,
        meta: exports.PLAN_PRICING_META[plan],
        features,
    };
});
exports.ACCESS_POLICIES = {
    purchasing: { minPlan: exports.PLAN.PROFESSIONAL, featureKey: exports.FEATURE_KEY.PURCHASING, module: exports.MODULE_KEY.PURCHASING },
    approvals: { minPlan: exports.PLAN.PROFESSIONAL, featureKey: exports.FEATURE_KEY.APPROVALS, module: exports.MODULE_KEY.APPROVALS },
    apiKeys: { minPlan: exports.PLAN.PROFESSIONAL, featureKey: exports.FEATURE_KEY.API_ACCESS },
    roles: { minPlan: exports.PLAN.PROFESSIONAL, featureKey: exports.FEATURE_KEY.ROLE_MANAGEMENT },
    deliveryNotes: { minPlan: exports.PLAN.PROFESSIONAL, module: exports.MODULE_KEY.INVOICING },
    documentCenter: { minPlan: exports.PLAN.STARTER, featureKey: exports.FEATURE_KEY.DOCUMENT_CENTER, module: exports.MODULE_KEY.DOCUMENTS },
    smartNotifications: { minPlan: exports.PLAN.STARTER, featureKey: exports.FEATURE_KEY.SMART_NOTIFICATIONS },
    smartNotificationExternalActions: { minPlan: exports.PLAN.PROFESSIONAL, featureKey: exports.FEATURE_KEY.SMART_NOTIFICATIONS },
    eDocuments: { minPlan: exports.PLAN.STARTER, module: exports.MODULE_KEY.INVOICING },
    bankTransactions: { minPlan: exports.PLAN.PROFESSIONAL, module: exports.MODULE_KEY.ACCOUNTING },
    checkPromissory: { minPlan: exports.PLAN.PROFESSIONAL, module: exports.MODULE_KEY.ACCOUNTING },
    reconciliations: { minPlan: exports.PLAN.PROFESSIONAL, featureKey: exports.FEATURE_KEY.BANK_RECONCILIATION, module: exports.MODULE_KEY.ACCOUNTING },
    stockValuations: { minPlan: exports.PLAN.PROFESSIONAL, module: exports.MODULE_KEY.INVENTORY },
    reservations: { minPlan: exports.PLAN.PROFESSIONAL, module: exports.MODULE_KEY.INVENTORY },
    productBatches: { minPlan: exports.PLAN.PROFESSIONAL, module: exports.MODULE_KEY.INVENTORY },
    lotSerials: { minPlan: exports.PLAN.PROFESSIONAL, featureKey: exports.FEATURE_KEY.LOT_SERIAL_TRACKING, module: exports.MODULE_KEY.INVENTORY },
    bulkOperations: { minPlan: exports.PLAN.PROFESSIONAL, featureKey: exports.FEATURE_KEY.BULK_OPERATIONS },
    advancedStockSuggestions: { minPlan: exports.PLAN.PROFESSIONAL, module: exports.MODULE_KEY.INVENTORY },
    auditLogExport: { minPlan: exports.PLAN.PROFESSIONAL, featureKey: exports.FEATURE_KEY.AUDIT_LOG },
    cashflowForecast: { minPlan: exports.PLAN.PROFESSIONAL, featureKey: exports.FEATURE_KEY.CASHFLOW_FORECAST, module: exports.MODULE_KEY.REPORTING },
    supplierPerformance: { minPlan: exports.PLAN.PROFESSIONAL, featureKey: exports.FEATURE_KEY.PURCHASING, module: exports.MODULE_KEY.PURCHASING },
    workflowAutomation: { minPlan: exports.PLAN.PROFESSIONAL, featureKey: exports.FEATURE_KEY.WORKFLOW_CENTER, module: exports.MODULE_KEY.WORKFLOW },
    production: { minPlan: exports.PLAN.ENTERPRISE, featureKey: exports.FEATURE_KEY.PRODUCTION, module: exports.MODULE_KEY.PRODUCTION },
    service: { minPlan: exports.PLAN.ENTERPRISE, featureKey: exports.FEATURE_KEY.SERVICE, module: exports.MODULE_KEY.SERVICE },
    marketplace: { minPlan: exports.PLAN.ENTERPRISE, featureKey: exports.FEATURE_KEY.MARKETPLACE, module: exports.MODULE_KEY.MARKETPLACE },
    b2bIntegrations: { minPlan: exports.PLAN.ENTERPRISE, featureKey: exports.FEATURE_KEY.MARKETPLACE, module: exports.MODULE_KEY.MARKETPLACE },
    hr: { minPlan: exports.PLAN.ENTERPRISE, featureKey: exports.FEATURE_KEY.HR, module: exports.MODULE_KEY.HR },
    payroll: { minPlan: exports.PLAN.ENTERPRISE, featureKey: exports.FEATURE_KEY.PAYROLL, module: exports.MODULE_KEY.PAYROLL },
    mail: { minPlan: exports.PLAN.ENTERPRISE, featureKey: exports.FEATURE_KEY.MAIL_CENTER, module: exports.MODULE_KEY.MAIL },
    chat: { minPlan: exports.PLAN.ENTERPRISE },
    aiGovernance: { minPlan: exports.PLAN.ENTERPRISE },
};
function isPlanAtLeast(currentPlan, requiredPlan) {
    return exports.PLAN_RANK[currentPlan] >= exports.PLAN_RANK[requiredPlan];
}
function normalizeModuleKey(module) {
    return String(module).toLowerCase();
}
