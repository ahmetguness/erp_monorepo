export type AdminInboxCategory =
  | "APPROVAL"
  | "SECURITY"
  | "INCIDENT"
  | "EXPIRATION";
export type AdminInboxPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface AdminInboxItem {
  id: string;
  sourceId: string;
  category: AdminInboxCategory;
  priority: AdminInboxPriority;
  title: string;
  description: string;
  href: string;
  ownerId: string | null;
  dueAt: string | null;
  overdue: boolean;
  readAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AdminInboxPreferences {
  approvals: boolean;
  security: boolean;
  incidents: boolean;
  expirations: boolean;
}

export interface AdminInboxResponse {
  items: AdminInboxItem[];
  unreadCount: number;
  overdueCount: number;
  preferences: AdminInboxPreferences;
}

export type AdminInboxAction =
  | "READ"
  | "UNREAD"
  | "RESOLVE"
  | "REOPEN"
  | "ASSIGN";
