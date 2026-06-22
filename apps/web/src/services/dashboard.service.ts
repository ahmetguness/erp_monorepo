import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { PaginatedResponseSchema, SingleResponseSchema } from '@/types/api.types';

const DashboardInvoiceSchema = z.object({
  id: z.string(),
  number: z.string(),
  date: z.string(),
  status: z.string(),
  type: z.string(),
  totalGross: z.coerce.number(),
  contact: z.object({ name: z.string().optional() }).nullable().optional(),
});

const DashboardNotificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  message: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  module: z.string().nullable(),
});

const DashboardApprovalRequestApiSchema = z.object({
  id: z.string(),
  status: z.string(),
  requestedBy: z.string().nullable(),
  createdAt: z.string(),
  flow: z.object({
    module: z.string(),
    name: z.string(),
  }).optional(),
});

const DashboardApprovalRequestSchema = z.object({
  id: z.string(),
  module: z.string(),
  status: z.string(),
  requestedBy: z.object({ name: z.string().optional() }).nullable(),
  createdAt: z.string(),
});

const DashboardTaskSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  priority: z.string(),
  status: z.string().optional(),
  dueAt: z.string().nullable(),
  href: z.string(),
});

const DashboardInvoiceListSchema = PaginatedResponseSchema(DashboardInvoiceSchema);
const DashboardNotificationListSchema = z.object({
  data: z.array(DashboardNotificationSchema),
  meta: z.object({ unreadCount: z.coerce.number() }),
});
const DashboardApprovalRequestListSchema = PaginatedResponseSchema(DashboardApprovalRequestApiSchema);

export type DashboardInvoice = z.infer<typeof DashboardInvoiceSchema>;
export type DashboardNotification = z.infer<typeof DashboardNotificationSchema>;
export type DashboardApprovalRequest = z.infer<typeof DashboardApprovalRequestSchema>;
export type DashboardTask = z.infer<typeof DashboardTaskSchema>;
export type DashboardInvoiceList = z.infer<typeof DashboardInvoiceListSchema>;
type DashboardApprovalRequestApi = z.infer<typeof DashboardApprovalRequestApiSchema>;

function mapDashboardApprovalRequest(row: DashboardApprovalRequestApi): DashboardApprovalRequest {
  return {
    id: row.id,
    module: row.flow?.module ?? 'approvals',
    status: row.status,
    requestedBy: row.requestedBy ? { name: row.requestedBy } : null,
    createdAt: row.createdAt,
  };
}

export async function getDashboardInvoices(limit: number): Promise<DashboardInvoiceList> {
  const res = await apiClient.get('/api/invoices', { params: { limit } });
  return safeParse(DashboardInvoiceListSchema, res.data, 'getDashboardInvoices');
}

export async function getDashboardNotifications(limit: number): Promise<DashboardNotification[]> {
  const res = await apiClient.get('/api/notifications', { params: { limit } });
  return safeParse(DashboardNotificationListSchema, res.data, 'getDashboardNotifications').data;
}

export async function getDashboardApprovalRequests(limit: number): Promise<DashboardApprovalRequest[]> {
  const res = await apiClient.get('/api/approvals/requests', { params: { limit } });
  return safeParse(DashboardApprovalRequestListSchema, res.data, 'getDashboardApprovalRequests').data.map(mapDashboardApprovalRequest);
}

export async function getDashboardTasks(): Promise<DashboardTask[]> {
  const res = await apiClient.get('/api/tasks');
  return safeParse(SingleResponseSchema(z.array(DashboardTaskSchema)), res.data, 'getDashboardTasks').data;
}
