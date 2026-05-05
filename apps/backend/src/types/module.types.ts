// ─────────────────────────────────────────────
// Module Types
// ─────────────────────────────────────────────

/**
 * Uygulama modülleri.
 * NOT: Prisma schema'da AppModule enum tanımlı ama Tenant.modules String[] olduğu için
 * Prisma client bu enum'u generate etmez. Bu enum uygulama katmanında kullanılır.
 */
export enum AppModule {
  ACCOUNTING  = 'ACCOUNTING',
  INVENTORY   = 'INVENTORY',
  CRM         = 'CRM',
  SALES       = 'SALES',
  PURCHASING  = 'PURCHASING',
  WAREHOUSE   = 'WAREHOUSE',
  PRODUCTION  = 'PRODUCTION',
  SERVICE     = 'SERVICE',
  HR          = 'HR',
  PAYROLL     = 'PAYROLL',
  MARKETPLACE = 'MARKETPLACE',
  REPORTING   = 'REPORTING',
  // Schema ile senkron — CONTACTS, INVOICING, APPROVALS eklendi
  CONTACTS    = 'CONTACTS',
  INVOICING   = 'INVOICING',
  APPROVALS   = 'APPROVALS',
}

/**
 * Uygulama içinde kullanılan modül string sabitleri (lowercase).
 * Tenant.modules String[] alanıyla eşleşir.
 */
export const MODULE_KEYS = {
  ACCOUNTING  : 'accounting',
  INVENTORY   : 'inventory',
  CONTACTS    : 'contacts',
  INVOICING   : 'invoicing',
  REPORTING   : 'reporting',
  PURCHASING  : 'purchasing',
  PRODUCTION  : 'production',
  SERVICE     : 'service',
  MARKETPLACE : 'marketplace',
  PAYROLL     : 'payroll',
  HR          : 'hr',
  APPROVALS   : 'approvals',
  WAREHOUSE   : 'warehouse',
} as const;

export type ModuleKey = (typeof MODULE_KEYS)[keyof typeof MODULE_KEYS];

export interface ModuleAccessResult {
  module: ModuleKey;
  isActive: boolean;
  reason?: string;
}

/**
 * AppModule enum → string key dönüşümü
 */
export const APP_MODULE_TO_KEY: Record<AppModule, ModuleKey> = {
  [AppModule.ACCOUNTING]  : MODULE_KEYS.ACCOUNTING,
  [AppModule.INVENTORY]   : MODULE_KEYS.INVENTORY,
  [AppModule.CRM]         : MODULE_KEYS.CONTACTS,
  [AppModule.SALES]       : MODULE_KEYS.INVOICING,
  [AppModule.PURCHASING]  : MODULE_KEYS.PURCHASING,
  [AppModule.WAREHOUSE]   : MODULE_KEYS.WAREHOUSE,
  [AppModule.PRODUCTION]  : MODULE_KEYS.PRODUCTION,
  [AppModule.SERVICE]     : MODULE_KEYS.SERVICE,
  [AppModule.HR]          : MODULE_KEYS.HR,
  [AppModule.PAYROLL]     : MODULE_KEYS.PAYROLL,
  [AppModule.MARKETPLACE] : MODULE_KEYS.MARKETPLACE,
  [AppModule.REPORTING]   : MODULE_KEYS.REPORTING,
  [AppModule.CONTACTS]    : MODULE_KEYS.CONTACTS,
  [AppModule.INVOICING]   : MODULE_KEYS.INVOICING,
  [AppModule.APPROVALS]   : MODULE_KEYS.APPROVALS,
};
