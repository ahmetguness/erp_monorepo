import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

export const ApprovalFlowConditionsSchema = z.object({
  minAmount: z.coerce.number().nullable(),
  maxAmount: z.coerce.number().nullable(),
  departments: z.array(z.string()),
  documentTypes: z.array(z.string()),
});

export const ApprovalRequestContextSchema = z.object({
  amount: z.coerce.number().nullable(),
  department: z.string().nullable(),
  documentType: z.string().nullable(),
});

export const ApprovalStepSchema = z.object({
  id: z.string(), flowId: z.string(), stepOrder: z.coerce.number(),
  name: z.string(), approverRoleId: z.string().nullable(), approverUserId: z.string().nullable(),
  isRequired: z.boolean(),
  approverRole: z.object({ id: z.string(), name: z.string() }).optional().nullable(),
  approverUser: z.object({ id: z.string(), name: z.string() }).optional().nullable(),
});

export const ApprovalFlowSchema = z.object({
  id: z.string(), tenantId: z.string(), name: z.string(),
  module: z.enum(['PURCHASE_REQUEST', 'LEAVE_REQUEST', 'INVOICE', 'SALES_ORDER', 'PURCHASE_ORDER', 'SERVICE_REQUEST', 'OTHER']),
  conditions: ApprovalFlowConditionsSchema.nullable().optional(),
  isActive: z.boolean(), createdAt: z.string(), updatedAt: z.string(),
  steps: z.array(ApprovalStepSchema).optional(),
  _count: z.object({ requests: z.coerce.number() }).optional(),
});

export const ApprovalActionSchema = z.object({
  id: z.string(), requestId: z.string(), stepId: z.string().nullable(),
  actionType: z.enum(['APPROVE', 'REJECT', 'ESCALATE', 'COMMENT', 'REASSIGN']),
  actorId: z.string().nullable(), notes: z.string().nullable(), createdAt: z.string(),
});

export const ApprovalRequestSchema = z.object({
  id: z.string(), tenantId: z.string(), flowId: z.string(),
  entityType: z.string(), entityId: z.string(),
  context: ApprovalRequestContextSchema.nullable().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ESCALATED']),
  currentStep: z.coerce.number(), requestedBy: z.string().nullable(),
  notes: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
  flow: z.object({ id: z.string(), name: z.string(), module: z.string() }).optional(),
  actions: z.array(ApprovalActionSchema).optional(),
});

export type ApprovalFlow = z.infer<typeof ApprovalFlowSchema>;
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export type ApprovalStep = z.infer<typeof ApprovalStepSchema>;
export type ApprovalFlowConditions = z.infer<typeof ApprovalFlowConditionsSchema>;
export type ApprovalRequestContext = z.infer<typeof ApprovalRequestContextSchema>;
export type ApprovalModule = ApprovalFlow['module'];
export type ApprovalStatus = ApprovalRequest['status'];

export interface CreateFlowDTO {
  name: string; module: ApprovalModule;
  conditions?: ApprovalFlowConditions;
  steps: Array<{ stepOrder: number; name: string; approverRoleId?: string; approverUserId?: string; isRequired?: boolean }>;
}
export interface UpdateFlowDTO {
  name?: string; isActive?: boolean;
  conditions?: ApprovalFlowConditions;
  steps?: Array<{ stepOrder: number; name: string; approverRoleId?: string; approverUserId?: string; isRequired?: boolean }>;
}
export interface CreateRequestDTO { flowId: string; entityType: string; entityId: string; context?: ApprovalRequestContext; requestedBy?: string; notes?: string }
export interface ActionDTO { actionType: 'APPROVE' | 'REJECT' | 'ESCALATE' | 'COMMENT'; stepId?: string; actorId?: string; notes?: string }
export interface FlowListParams extends PaginationParams { module?: string; isActive?: string }
export interface RequestListParams extends PaginationParams { status?: string; entityType?: string }

export async function getApprovalFlows(params: FlowListParams) {
  const res = await apiClient.get('/api/approvals/flows', { params });
  return safeParse(PaginatedResponseSchema(ApprovalFlowSchema), res.data, 'getApprovalFlows');
}
export async function getApprovalFlowById(id: string): Promise<ApprovalFlow> {
  const res = await apiClient.get(`/api/approvals/flows/${id}`);
  return safeParse(SingleResponseSchema(ApprovalFlowSchema), res.data, 'getApprovalFlowById').data;
}
export async function createApprovalFlow(data: CreateFlowDTO): Promise<ApprovalFlow> {
  const res = await apiClient.post('/api/approvals/flows', data);
  return safeParse(SingleResponseSchema(ApprovalFlowSchema), res.data, 'createApprovalFlow').data;
}
export async function deleteApprovalFlow(id: string) {
  await apiClient.delete(`/api/approvals/flows/${id}`);
}
export async function updateApprovalFlow(id: string, data: UpdateFlowDTO): Promise<ApprovalFlow> {
  const res = await apiClient.patch(`/api/approvals/flows/${id}`, data);
  return safeParse(SingleResponseSchema(ApprovalFlowSchema), res.data, 'updateApprovalFlow').data;
}
export async function getApprovalRequests(params: RequestListParams) {
  const res = await apiClient.get('/api/approvals/requests', { params });
  return safeParse(PaginatedResponseSchema(ApprovalRequestSchema), res.data, 'getApprovalRequests');
}
export async function createApprovalRequest(data: CreateRequestDTO): Promise<ApprovalRequest> {
  const res = await apiClient.post('/api/approvals/requests', data);
  return safeParse(SingleResponseSchema(ApprovalRequestSchema), res.data, 'createApprovalRequest').data;
}
export async function addApprovalAction(requestId: string, data: ActionDTO) {
  const res = await apiClient.post(`/api/approvals/requests/${requestId}/action`, data);
  return res.data.data;
}

export async function deleteApprovalRequest(id: string): Promise<void> {
  await apiClient.delete(`/api/approvals/requests/${id}`);
}
