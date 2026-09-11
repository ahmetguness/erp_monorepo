export const ADMIN_ROLE_KEYS = [
  "SUPER_ADMIN",
  "SUPPORT",
  "FINANCE",
  "OPERATIONS",
  "SECURITY",
  "READ_ONLY_AUDITOR",
] as const;
export type AdminRoleKey = (typeof ADMIN_ROLE_KEYS)[number];

export const ADMIN_PERMISSIONS = [
  "admin-user.read",
  "admin-user.manage",
  "support-session.manage",
  "dashboard.read",
  "tenant.read",
  "tenant.export",
  "tenant.create",
  "tenant.settings.update",
  "tenant.plan.update",
  "tenant.status.update",
  "feature.read",
  "feature.update",
  "feature.override.create",
  "feature.override.delete",
  "operations.read",
  "operations.manage",
  "audit.read",
  "audit.manage",
  "security.read",
  "security.manage",
  "demo.read",
  "demo.approve",
  "demo.reject",
  "change-request.read",
  "change-request.reject",
  "tenant.plan.approve",
  "tenant.status.approve",
  "feature.approve",
  "feature.override.approve",
  "support-ticket.read",
  "support-ticket.manage",
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_ROLE_PERMISSIONS = {
  SUPER_ADMIN: ADMIN_PERMISSIONS,
  SUPPORT: [
    "support-session.manage",
    "support-ticket.read",
    "support-ticket.manage",
    "dashboard.read",
    "tenant.read",
    "tenant.settings.update",
    "feature.read",
    "demo.read",
  ],
  FINANCE: [
    "dashboard.read",
    "tenant.read",
    "tenant.plan.update",
    "tenant.plan.approve",
    "change-request.read",
    "change-request.reject",
    "audit.read",
    "demo.read",
  ],
  OPERATIONS: [
    "dashboard.read",
    "tenant.read",
    "tenant.status.update",
    "tenant.status.approve",
    "change-request.read",
    "change-request.reject",
    "feature.read",
    "operations.read",
    "operations.manage",
    "demo.read",
    "demo.approve",
    "demo.reject",
  ],
  SECURITY: [
    "dashboard.read",
    "tenant.read",
    "operations.read",
    "audit.read",
    "audit.manage",
    "security.read",
    "security.manage",
  ],
  READ_ONLY_AUDITOR: [
    "dashboard.read",
    "tenant.read",
    "feature.read",
    "operations.read",
    "audit.read",
    "security.read",
    "demo.read",
  ],
} as const satisfies Record<AdminRoleKey, readonly AdminPermission[]>;

export interface AdminIdentity {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: AdminRoleKey[];
  permissions: AdminPermission[];
}

export type AdminLoginResult =
  | { status: "AUTHENTICATED"; admin: AdminIdentity }
  | { status: "MFA_REQUIRED" }
  | { status: "MFA_SETUP_REQUIRED"; secret: string; otpauthUri: string };

export interface AdminSessionSummary {
  id: string;
  deviceName: string;
  ipAddress: string | null;
  current: boolean;
  rememberMe: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}
export interface AdminSecurityEventSummary {
  id: string;
  type: string;
  message: string;
  ipAddress: string | null;
  createdAt: string;
}

export function isAdminPermission(value: string): value is AdminPermission {
  return (ADMIN_PERMISSIONS as readonly string[]).includes(value);
}

export function hasAdminPermission(
  permissions: readonly AdminPermission[],
  permission: AdminPermission,
): boolean {
  return permissions.includes(permission);
}

export const ADMIN_CHANGE_REQUEST_TYPES = [
  "TENANT_PLAN_UPDATE",
  "TENANT_STATUS_UPDATE",
  "PLAN_FEATURE_UPDATE",
  "FEATURE_OVERRIDE_UPSERT",
  "FEATURE_OVERRIDE_DELETE",
  "FEATURE_ROLLOUT_ACTIVATE",
] as const;
export type AdminChangeRequestType =
  (typeof ADMIN_CHANGE_REQUEST_TYPES)[number];

export const ADMIN_CHANGE_REQUEST_STATUSES = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "APPLIED",
  "ROLLED_BACK",
] as const;
export type AdminChangeRequestStatus =
  (typeof ADMIN_CHANGE_REQUEST_STATUSES)[number];

export interface AdminChangeRequestActor {
  id: string;
  name: string;
  email: string;
}
export interface AdminChangeRequest {
  id: string;
  type: AdminChangeRequestType;
  status: AdminChangeRequestStatus;
  targetId: string;
  targetLabel: string;
  requiredPermission: AdminPermission;
  payload: Record<string, unknown>;
  previousValues: Record<string, unknown> | null;
  affectedTenantCount: number;
  affectedUserCount: number;
  requestedBy: AdminChangeRequestActor;
  decidedBy: AdminChangeRequestActor | null;
  decisionNote: string | null;
  reason: string;
  ticketId: string | null;
  rollbackOfId: string | null;
  canRollback: boolean;
  createdAt: string;
  decidedAt: string | null;
  appliedAt: string | null;
}

export interface PendingAdminChangeResult {
  requiresApproval: true;
  changeRequest: AdminChangeRequest;
}

export interface ChangePreviewField {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
}

export interface ChangePreview {
  type: AdminChangeRequestType;
  targetId: string;
  targetLabel: string;
  changes: ChangePreviewField[];
  affectedTenantCount: number;
  affectedUserCount: number;
  warnings: string[];
  requiresApproval: boolean;
}

export interface AdminAuditActor {
  id: string;
  name: string;
  email: string;
}

export interface AdminAuditLog {
  id: string;
  tenantId: string;
  userId: string | null;
  adminId: string | null;
  admin: AdminAuditActor | null;
  module: string;
  entityType: string;
  entityId: string;
  action: string;
  reason: string | null;
  ticketId: string | null;
  requestId: string | null;
  approvalId: string | null;
  rollbackOfId: string | null;
  createdAt: string;
}
