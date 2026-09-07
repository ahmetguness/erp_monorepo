import type { AdminPermission, AdminRoleKey } from '@repo/types';

export interface AdminAccessContext {
  adminId: string;
  adminEmail: string;
  adminRoles: AdminRoleKey[];
  adminPermissions: AdminPermission[];
  adminSessionId: string;
  adminMfaVerifiedAt: string;
}

export interface AdminJwtPayload {
  adminId: string;
  email: string;
  role: 'admin';
  sessionId: string;
  tokenVersion: number;
  mfaVerifiedAt: string;
}
