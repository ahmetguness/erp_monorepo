import { Context } from 'hono';
import { ApprovalModule, ApprovalStatus, ApprovalActionType, EntityType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface CreateApprovalFlowDTO {
  name: string;
  module: ApprovalModule;
  steps: Array<{
    stepOrder: number;
    name: string;
    approverRoleId?: string;
    approverUserId?: string;
    isRequired?: boolean;
  }>;
}

interface UpdateApprovalFlowDTO {
  name?: string;
  isActive?: boolean;
  steps?: Array<{
    stepOrder: number;
    name: string;
    approverRoleId?: string;
    approverUserId?: string;
    isRequired?: boolean;
  }>;
}

interface CreateApprovalRequestDTO {
  flowId: string;
  entityType: EntityType;
  entityId: string;
  requestedBy?: string;
  notes?: string;
}

interface ApprovalActionDTO {
  actionType: ApprovalActionType;
  stepId?: string;
  actorId?: string;
  notes?: string;
}

interface ApprovalFlowListQuery {
  page?: string;
  limit?: string;
  module?: ApprovalModule;
  isActive?: string;
}

interface ApprovalRequestListQuery {
  page?: string;
  limit?: string;
  status?: ApprovalStatus;
  entityType?: EntityType;
}

// ─────────────────────────────────────────────
// Approval Controller
// ApprovalFlow, ApprovalStep, ApprovalRequest, ApprovalAction
// ─────────────────────────────────────────────

export const ApprovalController = {
  // ── Approval Flows ───────────────────────────

  async listFlows(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const query = c.req.query() as ApprovalFlowListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      ...(query.module && { module: query.module }),
      ...(query.isActive !== undefined && { isActive: query.isActive === 'true' }),
    };

    const [total, flows] = await prisma.$transaction([
      prisma.approvalFlow.count({ where }),
      prisma.approvalFlow.findMany({
        where,
        include: {
          steps: { orderBy: { stepOrder: 'asc' } },
          _count: { select: { requests: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: flows,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async getFlow(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const flow = await prisma.approvalFlow.findFirst({
      where: { id, tenantId },
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
          include: {
            approverRole: { select: { id: true, name: true } },
            approverUser: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!flow) return c.json(new NotFoundError('Onay akışı', id).toJSON(), 404);
    return c.json({ data: flow });
  },

  async createFlow(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const body = await c.req.json<CreateApprovalFlowDTO>();

    if (!body.name || !body.module || !body.steps?.length) {
      return c.json(
        new ValidationError('name, module ve en az bir step zorunludur.').toJSON(),
        400,
      );
    }

    const flow = await prisma.approvalFlow.create({
      data: {
        tenantId,
        name: body.name,
        module: body.module,
        steps: {
          create: body.steps.map((s) => ({
            stepOrder: s.stepOrder,
            name: s.name,
            approverRoleId: s.approverRoleId ?? null,
            approverUserId: s.approverUserId ?? null,
            isRequired: s.isRequired ?? true,
          })),
        },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    return c.json({ data: flow }, 201);
  },

  async updateFlow(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const existing = await prisma.approvalFlow.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Onay akışı', id).toJSON(), 404);

    const body = await c.req.json<UpdateApprovalFlowDTO>();

    const flow = await prisma.$transaction(async (tx) => {
      if (body.steps) {
        await tx.approvalStep.deleteMany({ where: { flowId: id } });
        await tx.approvalStep.createMany({
          data: body.steps.map((s) => ({
            flowId: id,
            stepOrder: s.stepOrder,
            name: s.name,
            approverRoleId: s.approverRoleId ?? null,
            approverUserId: s.approverUserId ?? null,
            isRequired: s.isRequired ?? true,
          })),
        });
      }

      return tx.approvalFlow.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
    });

    return c.json({ data: flow });
  },

  async deleteFlow(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const existing = await prisma.approvalFlow.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Onay akışı', id).toJSON(), 404);

    await prisma.approvalFlow.delete({ where: { id } });
    return c.json({ data: { success: true } });
  },

  // ── Approval Requests ────────────────────────

  async listRequests(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const query = c.req.query() as ApprovalRequestListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      ...(query.status && { status: query.status }),
      ...(query.entityType && { entityType: query.entityType }),
    };

    const [total, requests] = await prisma.$transaction([
      prisma.approvalRequest.count({ where }),
      prisma.approvalRequest.findMany({
        where,
        include: {
          flow: { select: { id: true, name: true, module: true } },
          actions: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: requests,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async createRequest(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const body = await c.req.json<CreateApprovalRequestDTO>();

    if (!body.flowId || !body.entityType || !body.entityId) {
      return c.json(
        new ValidationError('flowId, entityType ve entityId zorunludur.').toJSON(),
        400,
      );
    }

    const flow = await prisma.approvalFlow.findFirst({
      where: { id: body.flowId, tenantId, isActive: true },
    });
    if (!flow) return c.json(new NotFoundError('Onay akışı', body.flowId).toJSON(), 404);

    const request = await prisma.approvalRequest.create({
      data: {
        tenantId,
        flowId: body.flowId,
        entityType: body.entityType,
        entityId: body.entityId,
        requestedBy: body.requestedBy ?? null,
        notes: body.notes ?? null,
      },
      include: { flow: { select: { id: true, name: true, module: true } } },
    });

    return c.json({ data: request }, 201);
  },

  async addAction(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const requestId = c.req.param('id')!;
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const request = await prisma.approvalRequest.findFirst({
      where: { id: requestId, tenantId },
      include: { flow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } } },
    });
    if (!request) return c.json(new NotFoundError('Onay talebi', requestId).toJSON(), 404);

    if (request.status !== ApprovalStatus.PENDING) {
      return c.json(new ValidationError('Bu talep zaten sonuçlanmış.').toJSON(), 400);
    }

    const body = await c.req.json<ApprovalActionDTO>();

    if (!body.actionType) {
      return c.json(new ValidationError('actionType zorunludur.').toJSON(), 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const action = await tx.approvalAction.create({
        data: {
          requestId,
          stepId: body.stepId ?? null,
          actionType: body.actionType,
          actorId: body.actorId ?? null,
          notes: body.notes ?? null,
        },
      });

      let newStatus = request.status;
      let newStep = request.currentStep;

      if (body.actionType === ApprovalActionType.APPROVE) {
        const totalSteps = request.flow.steps.length;
        if (request.currentStep >= totalSteps) {
          newStatus = ApprovalStatus.APPROVED;
        } else {
          newStep = request.currentStep + 1;
        }
      } else if (body.actionType === ApprovalActionType.REJECT) {
        newStatus = ApprovalStatus.REJECTED;
      } else if (body.actionType === ApprovalActionType.ESCALATE) {
        newStatus = ApprovalStatus.ESCALATED;
      }

      const updated = await tx.approvalRequest.update({
        where: { id: requestId },
        data: {
          status: newStatus,
          currentStep: newStep,
          ...(newStatus !== ApprovalStatus.PENDING && { resolvedAt: new Date() }),
        },
      });

      return { action, request: updated };
    });

    return c.json({ data: result }, 201);
  },
};
