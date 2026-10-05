import { ApprovalActionType,ApprovalModule,ApprovalStatus,EntityType,Prisma } from '@prisma/client';
import { Context } from 'hono';
import { ConflictError,ForbiddenError,NotFoundError,ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import {
evaluateApprovalConditions,
parseApprovalFlowConditions,
parseApprovalRequestContext,
toApprovalConditionJson,
toApprovalRequestContextJson,
} from '../../../../services/approval-conditions.service.js';
import { requireParam, requireTenantId, requireUserId } from '../../../../utils/context.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface CreateApprovalFlowDTO {
  name: string;
  module: ApprovalModule;
  conditions?: unknown;
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
  conditions?: unknown;
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
  context?: unknown;
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
  requestId?: string;
  status?: ApprovalStatus;
  entityType?: EntityType;
}

const STATE_CHANGING_ACTIONS = new Set<ApprovalActionType>([
  ApprovalActionType.APPROVE,
  ApprovalActionType.REJECT,
  ApprovalActionType.ESCALATE,
]);

function pageNumber(value: string | undefined, fallback: number, max?: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) throw new ValidationError('Sayfalama degeri pozitif bir tam sayi olmalidir.');
  return max ? Math.min(max, parsed) : parsed;
}

function validateConditions(value: unknown): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('conditions bir nesne olmalidir.');
  const conditions = value as Record<string, unknown>;
  for (const key of ['minAmount', 'maxAmount'] as const) {
    const amount = conditions[key];
    if (amount !== undefined && amount !== null && (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0)) throw new ValidationError(`${key} sonlu ve negatif olmayan bir sayi olmalidir.`);
  }
  if (typeof conditions.minAmount === 'number' && typeof conditions.maxAmount === 'number' && conditions.minAmount > conditions.maxAmount) throw new ValidationError('minAmount maxAmount degerinden buyuk olamaz.');
  for (const key of ['departments', 'documentTypes'] as const) {
    const items = conditions[key];
    if (items !== undefined && (!Array.isArray(items) || items.some((item) => typeof item !== 'string' || !item.trim() || item.length > 100))) throw new ValidationError(`${key} bos olmayan metinlerden olusan bir dizi olmalidir.`);
  }
}

function validateRequestContext(value: unknown): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('context bir nesne olmalidir.');
  const context = value as Record<string, unknown>;
  if (context.amount !== undefined && context.amount !== null && (typeof context.amount !== 'number' || !Number.isFinite(context.amount) || context.amount < 0)) throw new ValidationError('context.amount sonlu ve negatif olmayan bir sayi olmalidir.');
  for (const key of ['department', 'documentType'] as const) {
    const item = context[key];
    if (item !== undefined && item !== null && (typeof item !== 'string' || !item.trim() || item.length > 100)) throw new ValidationError(`context.${key} gecerli bir metin olmalidir.`);
  }
}

function validateFlowSteps(steps: CreateApprovalFlowDTO['steps']): void {
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > 50) throw new ValidationError('Onay akisi 1 ile 50 arasinda adim icermelidir.');
  const orders = steps.map((step) => step.stepOrder);
  if (orders.some((order) => !Number.isInteger(order) || order < 1) || new Set(orders).size !== orders.length) throw new ValidationError('Adim siralari benzersiz pozitif tam sayilar olmalidir.');
  const sorted = [...orders].sort((a, b) => a - b);
  if (sorted.some((order, index) => order !== index + 1)) throw new ValidationError('Adim siralari 1\'den baslayarak kesintisiz olmalidir.');
  if (steps.some((step) => typeof step.name !== 'string' || !step.name.trim() || step.name.trim().length > 120)) throw new ValidationError('Her adim icin 1-120 karakterlik ad gereklidir.');
}

async function validateStepAssignments(tenantId: string, steps: CreateApprovalFlowDTO['steps']): Promise<void> {
  const roleIds = [...new Set(steps.flatMap((step) => step.approverRoleId ? [step.approverRoleId] : []))];
  const userIds = [...new Set(steps.flatMap((step) => step.approverUserId ? [step.approverUserId] : []))];
  const [roleCount, userCount] = await Promise.all([
    prisma.role.count({ where: { tenantId, id: { in: roleIds } } }),
    prisma.tenantUser.count({ where: { tenantId, userId: { in: userIds }, isActive: true } }),
  ]);
  if (roleCount !== roleIds.length) throw new ValidationError('Onayci rollerinin tamami ayni tenant icinde olmalidir.');
  if (userCount !== userIds.length) throw new ValidationError('Onayci kullanicilarinin tamami ayni tenant icinde aktif olmalidir.');
}

async function assertActorCanApprove(tenantId: string, userId: string, step: { approverRoleId: string | null; approverUserId: string | null }): Promise<void> {
  if (step.approverUserId && step.approverUserId !== userId) throw new ForbiddenError('Bu onay adimi baska bir kullaniciya atanmistir.');
  if (step.approverRoleId) {
    const membership = await prisma.tenantUser.findFirst({ where: { tenantId, userId, roleId: step.approverRoleId, isActive: true }, select: { id: true } });
    if (!membership) throw new ForbiddenError('Bu onay adimi farkli bir role atanmistir.');
  }
}

async function assertEntityOwnership(tenantId: string, entityType: EntityType, entityId: string): Promise<void> {
  if (entityType === EntityType.OTHER) return;
  const where = { id: entityId, tenantId };
  const entity = await (async () => {
    switch (entityType) {
      case EntityType.INVOICE: return prisma.invoice.findFirst({ where, select: { id: true } });
      case EntityType.PRODUCT: return prisma.product.findFirst({ where, select: { id: true } });
      case EntityType.CATEGORY: return prisma.category.findFirst({ where, select: { id: true } });
      case EntityType.CONTACT: return prisma.contact.findFirst({ where, select: { id: true } });
      case EntityType.EMPLOYEE: return prisma.employee.findFirst({ where, select: { id: true } });
      case EntityType.CUSTOMER_ASSET: return prisma.customerAsset.findFirst({ where, select: { id: true } });
      case EntityType.SERVICE_REQUEST: return prisma.serviceRequest.findFirst({ where, select: { id: true } });
      case EntityType.PURCHASE_ORDER: return prisma.purchaseOrder.findFirst({ where, select: { id: true } });
      case EntityType.SALES_QUOTE: return prisma.salesQuote.findFirst({ where, select: { id: true } });
      case EntityType.SALES_ORDER: return prisma.salesOrder.findFirst({ where, select: { id: true } });
      case EntityType.WORK_ORDER: return prisma.workOrder.findFirst({ where, select: { id: true } });
      case EntityType.DELIVERY_NOTE: return prisma.deliveryNote.findFirst({ where, select: { id: true } });
    }
  })();
  if (!entity) throw new NotFoundError('Onay talebine baglanacak kayit', entityId);
}

function assertFlowEntityCompatibility(module: ApprovalModule, entityType: EntityType): void {
  const requiredType: Partial<Record<ApprovalModule, EntityType>> = {
    [ApprovalModule.INVOICE]: EntityType.INVOICE,
    [ApprovalModule.SALES_ORDER]: EntityType.SALES_ORDER,
    [ApprovalModule.PURCHASE_ORDER]: EntityType.PURCHASE_ORDER,
    [ApprovalModule.SERVICE_REQUEST]: EntityType.SERVICE_REQUEST,
  };
  if (requiredType[module] && requiredType[module] !== entityType) throw new ValidationError('Onay akisi modulu ile kayit tipi uyusmuyor.');
}

// ─────────────────────────────────────────────
// Approval Controller
// ApprovalFlow, ApprovalStep, ApprovalRequest, ApprovalAction
// ─────────────────────────────────────────────

export const ApprovalController = {
  // ── Approval Flows ───────────────────────────

  async listFlows(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as ApprovalFlowListQuery;
    const page = pageNumber(query.page, 1);
    const pageSize = pageNumber(query.limit, 20, 100);
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
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

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
    const tenantId = requireTenantId(c);

    const body = await c.req.json<CreateApprovalFlowDTO>();

    const name = body.name?.trim();
    if (!name || name.length > 160 || !Object.values(ApprovalModule).includes(body.module) || !body.steps?.length) {
      return c.json(
        new ValidationError('name, module ve en az bir step zorunludur.').toJSON(),
        400,
      );
    }
    validateFlowSteps(body.steps);
    validateConditions(body.conditions);
    await validateStepAssignments(tenantId, body.steps);

    const flow = await prisma.approvalFlow.create({
      data: {
        tenantId,
        name,
        module: body.module,
        conditions: toApprovalConditionJson(parseApprovalFlowConditions(body.conditions)),
        steps: {
          create: body.steps.map((s) => ({
            stepOrder: s.stepOrder,
            name: s.name.trim(),
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
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.approvalFlow.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Onay akışı', id).toJSON(), 404);

    const body = await c.req.json<UpdateApprovalFlowDTO>();

    if (body.name !== undefined && (!body.name.trim() || body.name.trim().length > 160)) throw new ValidationError('Akis adi 1-160 karakter olmalidir.');
    validateConditions(body.conditions);
    if (body.steps) {
      validateFlowSteps(body.steps);
      await validateStepAssignments(tenantId, body.steps);
      const requestCount = await prisma.approvalRequest.count({ where: { flowId: id, tenantId } });
      if (requestCount > 0) throw new ConflictError('Talep gecmisi bulunan onay akisinin adimlari degistirilemez.');
    }

    const flow = await prisma.$transaction(async (tx) => {
      if (body.steps) {
        await tx.approvalStep.deleteMany({ where: { flowId: id } });
        await tx.approvalStep.createMany({
          data: body.steps.map((s) => ({
            flowId: id,
            stepOrder: s.stepOrder,
            name: s.name.trim(),
            approverRoleId: s.approverRoleId ?? null,
            approverUserId: s.approverUserId ?? null,
            isRequired: s.isRequired ?? true,
          })),
        });
      }

      return tx.approvalFlow.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name.trim() }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          ...(body.conditions !== undefined && { conditions: toApprovalConditionJson(parseApprovalFlowConditions(body.conditions)) }),
        },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
    });

    return c.json({ data: flow });
  },

  async deleteFlow(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.approvalFlow.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Onay akışı', id).toJSON(), 404);

    const requestCount = await prisma.approvalRequest.count({ where: { tenantId, flowId: id } });
    if (requestCount > 0) throw new ConflictError('Talep gecmisi bulunan onay akisi silinemez; pasife alinabilir.');
    await prisma.approvalFlow.delete({ where: { id } });
    return c.json({ data: { success: true } });
  },

  // ── Approval Requests ────────────────────────

  async listRequests(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as ApprovalRequestListQuery;
    const page = pageNumber(query.page, 1);
    const pageSize = pageNumber(query.limit, 20, 100);
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      ...(query.requestId && { id: query.requestId }),
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
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    const body = await c.req.json<CreateApprovalRequestDTO>();

    if (!body.flowId || !Object.values(EntityType).includes(body.entityType) || !body.entityId?.trim() || body.entityId.trim().length > 191) {
      return c.json(
        new ValidationError('flowId, entityType ve entityId zorunludur.').toJSON(),
        400,
      );
    }

    const flow = await prisma.approvalFlow.findFirst({
      where: { id: body.flowId, tenantId, isActive: true },
    });
    if (!flow) return c.json(new NotFoundError('Onay akışı', body.flowId).toJSON(), 404);

    assertFlowEntityCompatibility(flow.module, body.entityType);
    await assertEntityOwnership(tenantId, body.entityType, body.entityId.trim());
    validateRequestContext(body.context);
    const conditionEvaluation = evaluateApprovalConditions(flow.conditions, body.context, body.entityType);
    if (!conditionEvaluation.matches) {
      return c.json(
        new ValidationError(`Onay akisi kosullari eslesmedi: ${conditionEvaluation.reasons.join('; ')}`).toJSON(),
        400,
      );
    }
    const requestContext = parseApprovalRequestContext(body.context, body.entityType);

    let request;
    try {
      request = await prisma.approvalRequest.create({
        data: {
          tenantId,
          flowId: body.flowId,
          entityType: body.entityType,
          entityId: body.entityId.trim(),
          context: toApprovalRequestContextJson(requestContext),
          requestedBy: userId,
          notes: body.notes?.trim() || null,
        },
        include: { flow: { select: { id: true, name: true, module: true } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError('Bu akis ve kayit icin bekleyen bir onay talebi zaten var.');
      throw error;
    }

    return c.json({ data: request }, 201);
  },

  async addAction(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const requestId = requireParam(c, 'id');

    const request = await prisma.approvalRequest.findFirst({
      where: { id: requestId, tenantId },
      include: { flow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } } },
    });
    if (!request) return c.json(new NotFoundError('Onay talebi', requestId).toJSON(), 404);

    if (request.status !== ApprovalStatus.PENDING) {
      return c.json(new ValidationError('Bu talep zaten sonuçlanmış.').toJSON(), 400);
    }

    const body = await c.req.json<ApprovalActionDTO>();

    if (!body.actionType || !Object.values(ApprovalActionType).includes(body.actionType)) {
      return c.json(new ValidationError('actionType zorunludur.').toJSON(), 400);
    }

    if (body.actorId && body.actorId !== userId) throw new ValidationError('actorId istemci tarafindan degistirilemez.');
    if (body.notes && body.notes.length > 2000) throw new ValidationError('Not en fazla 2000 karakter olabilir.');
    const currentStep = request.flow.steps[request.currentStep - 1];
    if (!currentStep) throw new ConflictError('Onay akisinin aktif adimi bulunamadi.');
    if (body.stepId && body.stepId !== currentStep.id) throw new ValidationError('Islem yalnizca aktif onay adimi icin yapilabilir.');
    if (STATE_CHANGING_ACTIONS.has(body.actionType)) await assertActorCanApprove(tenantId, userId, currentStep);

    const result = await prisma.$transaction(async (tx) => {
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

      if (STATE_CHANGING_ACTIONS.has(body.actionType)) {
        const claimed = await tx.approvalRequest.updateMany({
          where: { id: requestId, tenantId, status: ApprovalStatus.PENDING, currentStep: request.currentStep },
          data: { status: newStatus, currentStep: newStep, ...(newStatus !== ApprovalStatus.PENDING && { resolvedAt: new Date() }) },
        });
        if (claimed.count !== 1) throw new ConflictError('Talep baska bir islem tarafindan degistirildi.');
      }

      const action = await tx.approvalAction.create({
        data: { requestId, stepId: currentStep.id, actionType: body.actionType, actorId: userId, notes: body.notes?.trim() || null },
      });
      const updated = await tx.approvalRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: { flow: { select: { id: true, name: true, module: true } } },
      });

      return { action, request: updated };
    });

    return c.json({ data: result }, 201);
  },

  async getRequest(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const request = await prisma.approvalRequest.findFirst({
      where: { id, tenantId },
      include: {
        flow: {
          include: {
            steps: {
              orderBy: { stepOrder: 'asc' },
              include: {
                approverRole: { select: { id: true, name: true } },
                approverUser: { select: { id: true, name: true } },
              },
            },
          },
        },
        actions: {
          orderBy: { createdAt: 'desc' },
          include: {
            step: { select: { id: true, name: true, stepOrder: true } },
          },
        },
      },
    });

    if (!request) return c.json(new NotFoundError('Onay talebi', id).toJSON(), 404);

    return c.json({ data: request });
  },

  async batchAction(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<{
      requestIds: string[];
      actionType: ApprovalActionType;
      notes?: string;
    }>();

    if (!body.requestIds || !Array.isArray(body.requestIds) || body.requestIds.length === 0 || body.requestIds.length > 50) {
      return c.json(new ValidationError('requestIds dizisi zorunludur.').toJSON(), 400);
    }
    if (![ApprovalActionType.APPROVE, ApprovalActionType.REJECT].includes(body.actionType)) {
      return c.json(new ValidationError('Toplu islem actionType degeri APPROVE veya REJECT olmalidir.').toJSON(), 400);
    }
    if (new Set(body.requestIds).size !== body.requestIds.length) throw new ValidationError('requestIds tekrar eden degerler iceremez.');
    if (body.notes && body.notes.length > 2000) throw new ValidationError('Not en fazla 2000 karakter olabilir.');

    const requests = await prisma.approvalRequest.findMany({
      where: {
        id: { in: body.requestIds },
        tenantId,
        status: ApprovalStatus.PENDING,
      },
      include: {
        flow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
      },
    });

    if (requests.length !== body.requestIds.length) throw new ConflictError('Taleplerden biri bulunamadi, baska tenant icinde veya artik beklemede degil.');
    for (const req of requests) {
      const currentStep = req.flow.steps[req.currentStep - 1];
      if (!currentStep) throw new ConflictError('Onay akisinin aktif adimi bulunamadi.');
      await assertActorCanApprove(tenantId, userId, currentStep);
    }

    const processed = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const req of requests) {
        const currentStep = req.flow.steps[req.currentStep - 1]!;
        let newStatus = req.status;
        let newStep = req.currentStep;

        if (body.actionType === ApprovalActionType.APPROVE) {
          const totalSteps = req.flow.steps.length;
          if (req.currentStep >= totalSteps) {
            newStatus = ApprovalStatus.APPROVED;
          } else {
            newStep = req.currentStep + 1;
          }
        } else if (body.actionType === ApprovalActionType.REJECT) {
          newStatus = ApprovalStatus.REJECTED;
        }

        const claimed = await tx.approvalRequest.updateMany({
          where: { id: req.id, tenantId, status: ApprovalStatus.PENDING, currentStep: req.currentStep },
          data: {
            status: newStatus,
            currentStep: newStep,
            ...(newStatus !== ApprovalStatus.PENDING && { resolvedAt: new Date() }),
          },
        });
        if (claimed.count !== 1) throw new ConflictError('Taleplerden biri baska bir islem tarafindan degistirildi.');

        const action = await tx.approvalAction.create({
          data: {
            requestId: req.id,
            stepId: currentStep.id,
            actionType: body.actionType,
            actorId: userId,
            notes: body.notes?.trim() || null,
          },
        });

        results.push({ id: req.id, status: newStatus, actionId: action.id });
      }
      return results;
    });

    return c.json({ data: { success: true, count: processed.length, items: processed } });
  },

  async deleteRequest(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.approvalRequest.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Onay talebi', id).toJSON(), 404);

    if (existing.status === ApprovalStatus.PENDING) {
      return c.json(new ValidationError('Bekleyen onay talepleri silinemez. Önce iptal edin.').toJSON(), 400);
    }

    await prisma.approvalRequest.delete({ where: { id } });
    return c.json({ data: { success: true } });
  },
};
