export const ADMIN_SENSITIVE_FIELDS = ["email", "phone", "errorDetails"] as const;
export type AdminSensitiveField = (typeof ADMIN_SENSITIVE_FIELDS)[number];
export const ADMIN_ACCESS_PURPOSES = ["SUPPORT_CASE", "SECURITY_INVESTIGATION", "BILLING_VALIDATION", "INCIDENT_RESPONSE"] as const;
export type AdminAccessPurpose = (typeof ADMIN_ACCESS_PURPOSES)[number];
export interface AdminSensitiveAccessGrant { id: string; tenantId: string; fields: AdminSensitiveField[]; purpose: AdminAccessPurpose; reason: string; expiresAt: string; }
export interface AdminSensitiveAccessState { maskedFields: AdminSensitiveField[]; revealedFields: AdminSensitiveField[]; expiresAt: string | null; }
export interface CreateAdminSensitiveAccessGrantInput { tenantId: string; fields: AdminSensitiveField[]; purpose: AdminAccessPurpose; reason: string; }
