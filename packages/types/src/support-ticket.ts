export const PLATFORM_TICKET_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_TENANT',
  'RESOLVED',
  'CLOSED',
] as const;
export type PlatformTicketStatus = (typeof PLATFORM_TICKET_STATUSES)[number];

export const PLATFORM_TICKET_PRIORITIES = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT',
] as const;
export type PlatformTicketPriority = (typeof PLATFORM_TICKET_PRIORITIES)[number];

export const PLATFORM_TICKET_CATEGORIES = [
  'TECHNICAL',
  'BILLING',
  'ACCOUNT',
  'FEATURE_REQUEST',
  'OTHER',
] as const;
export type PlatformTicketCategory = (typeof PLATFORM_TICKET_CATEGORIES)[number];

export const PLATFORM_TICKET_SENDERS = [
  'TENANT_USER',
  'ADMIN_USER',
] as const;
export type PlatformTicketSender = (typeof PLATFORM_TICKET_SENDERS)[number];

export interface PlatformTicketAuthorDto {
  id: string;
  name: string;
  email: string;
}

export interface PlatformTicketMessageDto {
  id: string;
  ticketId: string;
  senderType: PlatformTicketSender;
  authorUserId: string | null;
  authorAdminId: string | null;
  authorUser?: PlatformTicketAuthorDto | null;
  authorAdmin?: PlatformTicketAuthorDto | null;
  message: string;
  isInternal: boolean;
  createdAt: string;
}

export interface PlatformSupportTicketSummaryDto {
  id: string;
  ticketNumber: string;
  tenantId: string;
  tenantName?: string;
  tenantSlug?: string;
  createdById: string;
  createdByUser?: PlatformTicketAuthorDto | null;
  title: string;
  description: string;
  category: PlatformTicketCategory;
  priority: PlatformTicketPriority;
  status: PlatformTicketStatus;
  assignedAdminId: string | null;
  assignedAdmin?: PlatformTicketAuthorDto | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessageAt?: string | null;
}

export interface PlatformSupportTicketDetailDto extends PlatformSupportTicketSummaryDto {
  messages: PlatformTicketMessageDto[];
}

export interface CreateSupportTicketInput {
  title: string;
  description: string;
  category?: PlatformTicketCategory;
  priority?: PlatformTicketPriority;
}

export interface AddTicketMessageInput {
  message: string;
  isInternal?: boolean;
}

export interface UpdateTicketAdminInput {
  status?: PlatformTicketStatus;
  priority?: PlatformTicketPriority;
  assignedAdminId?: string | null;
}
