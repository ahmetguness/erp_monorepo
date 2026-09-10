export const SUPPORT_SCOPES = ['PRODUCTS', 'CONTACTS'] as const;
export type SupportScope = typeof SUPPORT_SCOPES[number];
export interface SupportSessionSummary {
  id: string;
  tenantId: string;
  adminId: string;
  targetUserId: string;
  reason: string;
  ticketId: string;
  scopes: SupportScope[];
  expiresAt: string;
  approvedAt: string | null;
  revokedAt: string | null;
  writeRequested: boolean;
  writeApprovedAt: string | null;
  admin: { name: string; email: string };
  targetUser: { name: string; email: string };
}
export interface CreateSupportSessionInput {
  tenantId: string;
  targetUserId: string;
  reason: string;
  ticketId: string;
  scopes: SupportScope[];
  durationMinutes: number;
  writeRequested: boolean;
}
