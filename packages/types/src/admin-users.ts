import type { AdminRoleKey } from "./admin-rbac.js";

export interface AdminUserSummary {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roles: AdminRoleKey[];
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  failedLoginCount: number;
  lastFailedLoginAt: string | null;
  activeSessionCount: number;
  invitationStatus: "NONE" | "PENDING" | "EXPIRED" | "ACCEPTED";
  invitationExpiresAt: string | null;
}

export interface InviteAdminInput {
  name: string;
  email: string;
  roles: AdminRoleKey[];
}
export interface UpdateAdminInput {
  roles: AdminRoleKey[];
  isActive: boolean;
}
