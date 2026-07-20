import { Context } from 'hono';
import { EDocumentType, EDocumentStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { requireTenantId, requireParam } from '../utils/context.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface EDocumentListQuery {
  page?: string;
  limit?: string;
  search?: string;
  type?: EDocumentType;
  status?: EDocumentStatus;
  invoiceId?: string;
  deliveryNoteId?: string;
  dateFrom?: string;
  dateTo?: string;
  source?: 'invoice' | 'delivery-note';
  onlyErrors?: string;
}

interface CreateEDocumentDTO {
  invoiceId?: string;
  deliveryNoteId?: string;
  type: EDocumentType;
  uuid?: string;
  providerCode?: string;
  requestPayload?: unknown;
}

interface UpdateEDocumentStatusDTO {
  status: EDocumentStatus;
  providerMessage?: string;
  responsePayload?: unknown;
}

type EDocumentCreditStatus = 'configured' | 'not_configured';

interface EDocumentSummaryStatusCount {
  status: EDocumentStatus;
  count: number;
}

interface EDocumentSummary {
  total: number;
  pending: number;
  sendingErrors: number;
  accepted: number;
  rejected: number;
  creditBalance: number | null;
  creditStatus: EDocumentCreditStatus;
  statusCounts: EDocumentSummaryStatusCount[];
  latestError: {
    id: string;
    status: EDocumentStatus;
    providerMessage: string | null;
    retryCount: number;
    createdAt: string;
  } | null;
  generatedAt: string;
}

function parseCreditBalance(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const E_DOCUMENT_STATUSES = [
  EDocumentStatus.PENDING,
  EDocumentStatus.PROCESSING,
  EDocumentStatus.SENT,
  EDocumentStatus.ACCEPTED,
  EDocumentStatus.REJECTED,
  EDocumentStatus.CANCELLED,
  EDocumentStatus.ERROR,
] as const;

// ─────────────────────────────────────────────
// E-Document Controller
// ─────────────────────────────────────────────

export const EDocumentController = {
  async summary(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const [
      total,
      pendingCount,
      processingCount,
      sentCount,
      acceptedCount,
      rejectedCount,
      cancelledCount,
      errorCount,
      creditSetting,
      latestError,
    ] = await prisma.$transaction([
      prisma.eDocument.count({ where: { tenantId } }),
      prisma.eDocument.count({ where: { tenantId, status: EDocumentStatus.PENDING } }),
      prisma.eDocument.count({ where: { tenantId, status: EDocumentStatus.PROCESSING } }),
      prisma.eDocument.count({ where: { tenantId, status: EDocumentStatus.SENT } }),
      prisma.eDocument.count({ where: { tenantId, status: EDocumentStatus.ACCEPTED } }),
      prisma.eDocument.count({ where: { tenantId, status: EDocumentStatus.REJECTED } }),
      prisma.eDocument.count({ where: { tenantId, status: EDocumentStatus.CANCELLED } }),
      prisma.eDocument.count({ where: { tenantId, status: EDocumentStatus.ERROR } }),
      prisma.tenantSetting.findFirst({
        where: {
          tenantId,
          key: { in: ['e_document_credit_balance', 'edocument_credit_balance', 'e_document_credits'] },
          value: { not: '' },
        },
        select: { value: true },
      }),
      prisma.eDocument.findFirst({
        where: {
          tenantId,
          status: { in: [EDocumentStatus.ERROR, EDocumentStatus.REJECTED] },
        },
        select: {
          id: true,
          status: true,
          providerMessage: true,
          retryCount: true,
          createdAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const statusCountMap: Record<(typeof E_DOCUMENT_STATUSES)[number], number> = {
      [EDocumentStatus.PENDING]: pendingCount,
      [EDocumentStatus.PROCESSING]: processingCount,
      [EDocumentStatus.SENT]: sentCount,
      [EDocumentStatus.ACCEPTED]: acceptedCount,
      [EDocumentStatus.REJECTED]: rejectedCount,
      [EDocumentStatus.CANCELLED]: cancelledCount,
      [EDocumentStatus.ERROR]: errorCount,
    };
    const creditBalance = parseCreditBalance(creditSetting?.value);

    const summary: EDocumentSummary = {
      total,
      pending: pendingCount + processingCount,
      sendingErrors: errorCount + rejectedCount,
      accepted: acceptedCount,
      rejected: rejectedCount,
      creditBalance,
      creditStatus: creditBalance === null ? 'not_configured' : 'configured',
      statusCounts: E_DOCUMENT_STATUSES.map((status) => ({ status, count: statusCountMap[status] })),
      latestError: latestError
        ? {
            ...latestError,
            createdAt: latestError.createdAt.toISOString(),
          }
        : null,
      generatedAt: new Date().toISOString(),
    };

    return c.json({ data: summary });
  },

  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as EDocumentListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;
    const search = query.search?.trim();
    const dateWhere = query.dateFrom || query.dateTo
      ? {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        }
      : undefined;

    const where = {
      tenantId,
      ...(search && {
        OR: [
          { id: { contains: search, mode: 'insensitive' as const } },
          { uuid: { contains: search, mode: 'insensitive' as const } },
          { providerCode: { contains: search, mode: 'insensitive' as const } },
          { providerMessage: { contains: search, mode: 'insensitive' as const } },
          { invoice: { number: { contains: search, mode: 'insensitive' as const } } },
          { deliveryNote: { number: { contains: search, mode: 'insensitive' as const } } },
        ],
      }),
      ...(query.type && { type: query.type }),
      ...(query.onlyErrors === 'true'
        ? { status: { in: [EDocumentStatus.ERROR, EDocumentStatus.REJECTED] } }
        : query.status && { status: query.status }),
      ...(query.invoiceId && { invoiceId: query.invoiceId }),
      ...(query.deliveryNoteId && { deliveryNoteId: query.deliveryNoteId }),
      ...(query.source === 'invoice' && { invoiceId: { not: null } }),
      ...(query.source === 'delivery-note' && { deliveryNoteId: { not: null } }),
      ...(dateWhere && { createdAt: dateWhere }),
    };

    const [total, docs] = await prisma.$transaction([
      prisma.eDocument.count({ where }),
      prisma.eDocument.findMany({
        where,
        include: {
          invoice: { select: { id: true, number: true, type: true } },
          deliveryNote: { select: { id: true, number: true, type: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: docs,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const doc = await prisma.eDocument.findFirst({
      where: { id, tenantId },
      include: {
        invoice: { select: { id: true, number: true, type: true, status: true } },
        deliveryNote: { select: { id: true, number: true, type: true, status: true } },
      },
    });

    if (!doc) return c.json(new NotFoundError('E-Belge', id).toJSON(), 404);
    return c.json({ data: doc });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<CreateEDocumentDTO>();

    if (!body.type) {
      return c.json(new ValidationError('type alanı zorunludur.').toJSON(), 400);
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });

    if (tenant?.plan === 'STARTER' && body.type === EDocumentType.E_WAYBILL) {
      return c.json(
        new ValidationError('Starter planı e-İrsaliye desteklememektedir.').toJSON(),
        400,
      );
    }

    // E_WAYBILL requires deliveryNoteId; E_INVOICE/E_ARCHIVE requires invoiceId
    if (body.type === EDocumentType.E_WAYBILL && !body.deliveryNoteId) {
      return c.json(
        new ValidationError('E_WAYBILL tipi için deliveryNoteId zorunludur.').toJSON(),
        400,
      );
    }
    if ((body.type === EDocumentType.E_INVOICE || body.type === EDocumentType.E_ARCHIVE) && !body.invoiceId) {
      return c.json(
        new ValidationError(`${body.type} tipi için invoiceId zorunludur.`).toJSON(),
        400,
      );
    }

    const doc = await prisma.eDocument.create({
      data: {
        tenantId,
        invoiceId: body.invoiceId ?? null,
        deliveryNoteId: body.deliveryNoteId ?? null,
        type: body.type,
        uuid: body.uuid ?? null,
        providerCode: body.providerCode ?? null,
        requestPayload: body.requestPayload as Prisma.InputJsonValue ?? undefined,
      },
      include: {
        invoice: { select: { id: true, number: true } },
        deliveryNote: { select: { id: true, number: true } },
      },
    });

    return c.json({ data: doc }, 201);
  },

  async updateStatus(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.eDocument.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('E-Belge', id).toJSON(), 404);

    const body = await c.req.json<UpdateEDocumentStatusDTO>();

    if (!body.status) {
      return c.json(new ValidationError('status alanı zorunludur.').toJSON(), 400);
    }

    const statusDateMap: Partial<Record<EDocumentStatus, string>> = {
      [EDocumentStatus.SENT]: 'sentAt',
      [EDocumentStatus.ACCEPTED]: 'acceptedAt',
      [EDocumentStatus.REJECTED]: 'rejectedAt',
      [EDocumentStatus.CANCELLED]: 'cancelledAt',
    };

    const dateField = statusDateMap[body.status];

    const updated = await prisma.eDocument.update({
      where: { id },
      data: {
        status: body.status,
        providerMessage: body.providerMessage ?? existing.providerMessage,
        responsePayload: body.responsePayload as Prisma.InputJsonValue ?? undefined,
        ...(dateField && { [dateField]: new Date() }),
        ...(body.status === EDocumentStatus.ERROR && {
          retryCount: { increment: 1 },
          lastRetryAt: new Date(),
        }),
      },
    });

    return c.json({ data: updated });
  },
};
