import { apiClient } from '@/lib/api-client';
import { adminApiClient } from '@/lib/admin-api-client';
import type {
  PlatformSupportTicketSummaryDto,
  PlatformSupportTicketDetailDto,
  PlatformTicketMessageDto,
  CreateSupportTicketInput,
  AddTicketMessageInput,
  UpdateTicketAdminInput,
} from '@repo/types';

// ─────────────────────────────────────────────
// Tenant Service Functions
// ─────────────────────────────────────────────

export async function listTenantTickets(params?: {
  status?: string;
  category?: string;
  search?: string;
}): Promise<PlatformSupportTicketSummaryDto[]> {
  const res = await apiClient.get<{ data: PlatformSupportTicketSummaryDto[] }>(
    '/api/support-tickets',
    { params }
  );
  return res.data.data;
}

export async function getTenantTicket(id: string): Promise<PlatformSupportTicketDetailDto> {
  const res = await apiClient.get<{ data: PlatformSupportTicketDetailDto }>(
    `/api/support-tickets/${encodeURIComponent(id)}`
  );
  return res.data.data;
}

export async function createTenantTicket(
  input: CreateSupportTicketInput
): Promise<PlatformSupportTicketDetailDto> {
  const res = await apiClient.post<{ data: PlatformSupportTicketDetailDto }>(
    '/api/support-tickets',
    input
  );
  return res.data.data;
}

export async function addTenantTicketMessage(
  ticketId: string,
  message: string
): Promise<PlatformTicketMessageDto> {
  const res = await apiClient.post<{ data: PlatformTicketMessageDto }>(
    `/api/support-tickets/${encodeURIComponent(ticketId)}/messages`,
    { message }
  );
  return res.data.data;
}

export async function closeTenantTicket(ticketId: string): Promise<void> {
  await apiClient.post(`/api/support-tickets/${encodeURIComponent(ticketId)}/close`);
}

export async function reopenTenantTicket(
  ticketId: string,
  reason?: string
): Promise<PlatformSupportTicketDetailDto> {
  const res = await apiClient.post<{ data: PlatformSupportTicketDetailDto }>(
    `/api/support-tickets/${encodeURIComponent(ticketId)}/reopen`,
    { reason }
  );
  return res.data.data;
}

// ─────────────────────────────────────────────
// Admin Service Functions
// ─────────────────────────────────────────────

export async function listAdminTickets(params?: {
  status?: string;
  priority?: string;
  category?: string;
  tenantId?: string;
  assignedAdminId?: string;
  search?: string;
}): Promise<PlatformSupportTicketSummaryDto[]> {
  const res = await adminApiClient.get<{ data: PlatformSupportTicketSummaryDto[] }>(
    '/api/admin/support-tickets',
    { params }
  );
  return res.data.data;
}

export async function getAdminTicket(id: string): Promise<PlatformSupportTicketDetailDto> {
  const res = await adminApiClient.get<{ data: PlatformSupportTicketDetailDto }>(
    `/api/admin/support-tickets/${encodeURIComponent(id)}`
  );
  return res.data.data;
}

export async function addAdminTicketMessage(
  ticketId: string,
  input: AddTicketMessageInput
): Promise<PlatformTicketMessageDto> {
  const res = await adminApiClient.post<{ data: PlatformTicketMessageDto }>(
    `/api/admin/support-tickets/${encodeURIComponent(ticketId)}/messages`,
    input
  );
  return res.data.data;
}

export async function updateAdminTicket(
  ticketId: string,
  input: UpdateTicketAdminInput
): Promise<PlatformSupportTicketDetailDto> {
  const res = await adminApiClient.patch<{ data: PlatformSupportTicketDetailDto }>(
    `/api/admin/support-tickets/${encodeURIComponent(ticketId)}`,
    input
  );
  return res.data.data;
}
