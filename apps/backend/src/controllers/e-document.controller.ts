import { Context } from 'hono';
import { EDocumentType, EDocumentStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { requireTenantId } from '../utils/context.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface EDocumentListQuery {
  page?: string;
  limit?: string;
  type?: EDocumentType;
  status?: EDocumentStatus;
  invoiceId?: string;
  deliveryNoteId?: string;
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

// ─────────────────────────────────────────────
// E-Document Controller
// ─────────────────────────────────────────────

export const EDocumentController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as EDocumentListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      ...(query.type && { type: query.type }),
      ...(query.status && { status: query.status }),
      ...(query.invoiceId && { invoiceId: query.invoiceId }),
      ...(query.deliveryNoteId && { deliveryNoteId: query.deliveryNoteId }),
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
    const id = c.req.param('id')!;

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
    const id = c.req.param('id')!;

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
