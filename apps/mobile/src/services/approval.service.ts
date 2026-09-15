import { z } from 'zod';
import { apiClient } from '../lib/api-client';
import { SingleResponseSchema } from '../types/api.types';

// ─────────────────────────────────────────────
// FAZ 3: Workflow / Approval Schemas
// ─────────────────────────────────────────────

export const ApprovalModuleEnum = z.enum([
  'PURCHASE_REQUEST',
  'LEAVE_REQUEST',
  'INVOICE',
  'SALES_ORDER',
  'PURCHASE_ORDER',
  'SERVICE_REQUEST',
  'OTHER',
]).catch('OTHER');

export const ApprovalStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'ESCALATED',
]).catch('PENDING');

export const ApprovalActionTypeEnum = z.enum([
  'APPROVE',
  'REJECT',
  'ESCALATE',
  'COMMENT',
  'REASSIGN',
]).catch('APPROVE');

export const ApprovalRequestContextSchema = z.preprocess((val) => {
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch {
      return {};
    }
  }
  if (typeof val === 'object' && val !== null) return val;
  return {};
}, z.object({
  amount: z.coerce.number().nullable().optional(),
  department: z.string().nullable().optional(),
  documentType: z.string().nullable().optional(),
}).passthrough());

export const ApprovalStepSchema = z.object({
  id: z.string(),
  flowId: z.string().optional(),
  stepOrder: z.coerce.number(),
  name: z.string(),
  approverRoleId: z.string().nullable().optional(),
  approverUserId: z.string().nullable().optional(),
  isRequired: z.boolean().default(true),
  approverRole: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  approverUser: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
});

export const ApprovalActionSchema = z.object({
  id: z.string(),
  requestId: z.string().optional(),
  stepId: z.string().nullable().optional(),
  actionType: ApprovalActionTypeEnum,
  actorId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  step: z.object({ id: z.string(), name: z.string(), stepOrder: z.coerce.number() }).nullable().optional(),
});

export const ApprovalFlowSchema = z.object({
  id: z.string(),
  name: z.string(),
  module: ApprovalModuleEnum,
  steps: z.array(ApprovalStepSchema).optional(),
});

export const ApprovalRequestSchema = z.object({
  id: z.string(),
  tenantId: z.string().optional(),
  flowId: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  context: ApprovalRequestContextSchema.nullable().optional(),
  status: ApprovalStatusEnum,
  currentStep: z.coerce.number().default(1),
  requestedBy: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  resolvedAt: z.string().nullable().optional(),
  flow: ApprovalFlowSchema,
  actions: z.array(ApprovalActionSchema).optional(),
});

export const ApprovalRequestListResponseSchema = z.object({
  data: z.array(ApprovalRequestSchema),
  meta: z.object({
    total: z.number().default(0),
    page: z.number().default(1),
    pageSize: z.number().default(20),
    totalPages: z.number().default(1),
  }).optional().default({ total: 0, page: 1, pageSize: 20, totalPages: 1 }),
});

export const SingleApprovalRequestResponseSchema = SingleResponseSchema(ApprovalRequestSchema);

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type ApprovalModule = z.infer<typeof ApprovalModuleEnum>;
export type ApprovalStatus = z.infer<typeof ApprovalStatusEnum>;
export type ApprovalActionType = z.infer<typeof ApprovalActionTypeEnum>;
export type ApprovalRequestContext = z.infer<typeof ApprovalRequestContextSchema>;
export type ApprovalStep = z.infer<typeof ApprovalStepSchema>;
export type ApprovalAction = z.infer<typeof ApprovalActionSchema>;
export type ApprovalFlow = z.infer<typeof ApprovalFlowSchema>;
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export interface ApprovalRequestListParams {
  page?: number;
  limit?: number;
  status?: ApprovalStatus;
  entityType?: string;
  requestId?: string;
}

// ─────────────────────────────────────────────
// Service Functions
// ─────────────────────────────────────────────

export async function getApprovalRequests(
  params?: ApprovalRequestListParams
): Promise<{ requests: ApprovalRequest[]; total: number; page: number; totalPages: number }> {
  const res = await apiClient.get('/api/approvals/requests', { params });
  const parsed = ApprovalRequestListResponseSchema.parse(res.data);
  return {
    requests: parsed.data,
    total: parsed.meta.total,
    page: parsed.meta.page,
    totalPages: parsed.meta.totalPages,
  };
}

export async function getApprovalRequestById(id: string): Promise<ApprovalRequest> {
  const res = await apiClient.get(`/api/approvals/requests/${id}`);
  return SingleApprovalRequestResponseSchema.parse(res.data).data;
}

export async function executeApprovalAction(
  requestId: string,
  actionType: 'APPROVE' | 'REJECT' | 'ESCALATE',
  notes?: string
): Promise<{ action: ApprovalAction; request: ApprovalRequest }> {
  const res = await apiClient.post(`/api/approvals/requests/${requestId}/action`, {
    actionType,
    notes,
  });
  return res.data.data;
}

export async function executeBatchApproval(
  requestIds: string[],
  actionType: 'APPROVE' | 'REJECT',
  notes?: string
): Promise<{ success: boolean; count: number; items: Array<{ id: string; status: ApprovalStatus }> }> {
  const res = await apiClient.post('/api/approvals/requests/batch-action', {
    requestIds,
    actionType,
    notes,
  });
  return res.data.data;
}
