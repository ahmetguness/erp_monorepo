import { AuditAction, EntityType, InvoiceStatus, InvoiceType } from '@prisma/client';
import { Context } from 'hono';
import { createEventContext, domainEvents } from '../../../../domain-events/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { getValidatedBody } from '../../../../middleware/validateBody.js';
import {
  createInvoiceBodySchema,
  updateInvoiceBodySchema,
  type CreateInvoiceBody,
} from '../../../../schemas/request-body.schemas.js';
import { BusinessRulesService } from '../../../../services/business-rules.service.js';
import { EDocumentAutomationService } from '../../../../services/edocument-automation.service.js';
import {
  assertAccountingPeriodOpen,
  assertInvoiceCancelable,
  readRequiredReason
} from '../../../../services/financial/index.js';
import { scanAndRecomputeInvoiceStatuses } from '../../../../services/financial/invoice-status.service.js';
import { assertInvoiceStatusTransition, isComputedInvoiceStatus } from '../../../../services/financial/status-transition.service.js';
import { reverseInvoiceAccountEntry } from '../../../../utils/account-entry.js';
import { createAuditLog, getRequestMeta } from '../../../../utils/audit.js';
import { salesApplication } from '../../composition.js';
import { parseIdempotencyKey } from '../../application/operations/idempotency-key.js';

type InvoiceLineDTO = CreateInvoiceBody['lines'][number];
import { requireParam, requireTenantId } from '../../../../utils/context.js';
import { generateDocumentNumber } from '../../../../utils/generate-number.js';
import { buildOwnershipChecks, validateTenantOwnership } from '../../../../utils/validateTenantOwnership.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface InvoiceListQuery {
  page?: string;
  limit?: string;
  type?: InvoiceType;
  status?: InvoiceStatus;
  contactId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

const businessRulesService = new BusinessRulesService(prisma);

function parseInvoiceType(value: string | undefined): InvoiceType | undefined {
  switch (value) {
    case InvoiceType.SALES:
    case InvoiceType.PURCHASE:
    case InvoiceType.RETURN_SALES:
    case InvoiceType.RETURN_PURCHASE:
      return value;
    default:
      return undefined;
  }
}

function parseInvoiceStatus(value: string | undefined): InvoiceStatus | undefined {
  switch (value) {
    case InvoiceStatus.DRAFT:
    case InvoiceStatus.SENT:
    case InvoiceStatus.PAID:
    case InvoiceStatus.PARTIALLY_PAID:
    case InvoiceStatus.OVERDUE:
    case InvoiceStatus.CANCELLED:
      return value;
    default:
      return undefined;
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function computeLineTotals(
  lines: InvoiceLineDTO[],
  tenantId: string,
): Promise<{
  lineData: Array<{
    productId: string | null;
    taxRateId: string | null;
    withholdingRateId: string | null;
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxAmount: number;
    withholdingAmount: number;
    lineTotal: number;
  }>;
  totalNet: number;
  totalTax: number;
  totalWithholding: number;
  totalGross: number;
}> {
  let totalNet = 0;
  let totalTax = 0;
  let totalWithholding = 0;

  const lineData = await Promise.all(
    lines.map(async (line) => {
      const discount = line.discount ?? 0;
      const net = line.quantity * line.unitPrice * (1 - discount / 100);

      let taxRate = 0;
      if (line.taxRateId) {
        const tr = await prisma.taxRate.findFirst({
          where: { id: line.taxRateId, tenantId },
          select: { rate: true },
        });
        taxRate = tr ? Number(tr.rate) : 0;
      }

      let withholdingRate = 0;
      if (line.withholdingRateId) {
        const wr = await prisma.taxRate.findFirst({
          where: { id: line.withholdingRateId, tenantId, isWithholding: true },
          select: { rate: true },
        });
        withholdingRate = wr ? Number(wr.rate) : 0;
      }

      const taxAmount = net * (taxRate / 100);
      const withholdingAmount = net * (withholdingRate / 100);
      const lineTotal = net + taxAmount - withholdingAmount;

      totalNet += net;
      totalTax += taxAmount;
      totalWithholding += withholdingAmount;

      return {
        productId: line.productId ?? null,
        taxRateId: line.taxRateId ?? null,
        withholdingRateId: line.withholdingRateId ?? null,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount,
        taxAmount,
        withholdingAmount,
        lineTotal,
      };
    }),
  );

  return {
    lineData,
    totalNet,
    totalTax,
    totalWithholding,
    totalGross: totalNet + totalTax - totalWithholding,
  };
}

function addDays(baseDate: Date, days: number): Date {
  const nextDate = new Date(baseDate);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

// ─────────────────────────────────────────────
// Invoice Controller
// ─────────────────────────────────────────────

export const InvoiceController = {
  async recomputeStatuses(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.get('userId') as string | undefined;
    const result = await scanAndRecomputeInvoiceStatuses(prisma, tenantId, { userId });
    return c.json({ data: result });
  },

  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as InvoiceListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;
    const type = parseInvoiceType(c.req.query('type'));
    const status = parseInvoiceStatus(c.req.query('status'));
    const search = query.search?.trim();

    const where = {
      tenantId,
      deletedAt: null,
      ...(type && { type }),
      ...(status && { status }),
      ...(query.contactId && { contactId: query.contactId }),
      ...(search && {
        OR: [
          { number: { contains: search, mode: 'insensitive' as const } },
          { contact: { name: { contains: search, mode: 'insensitive' as const } } },
          { contact: { code: { contains: search, mode: 'insensitive' as const } } },
          { contact: { taxNumber: { contains: search, mode: 'insensitive' as const } } },
        ],
      }),
      ...(query.dateFrom || query.dateTo
        ? {
          date: {
            ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
            ...(query.dateTo && { lte: new Date(query.dateTo) }),
          },
        }
        : {}),
    };

    const [total, invoices, summaryRows] = await prisma.$transaction([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        include: {
          contact: { select: { id: true, name: true, code: true, phone: true } },
          payments: { select: { amount: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.invoice.findMany({ where, select: { status: true, dueDate: true, totalGross: true, payments: { select: { amount: true } } } }),
    ]);

    const now = new Date();
    const data = invoices.map((invoice) => ({
      ...invoice,
      paidAmount: invoice.payments.reduce((sum, allocation) => sum + Number(allocation.amount), 0),
      payments: undefined,
    }));
    const summary = summaryRows.reduce((acc, invoice) => {
      const gross = Number(invoice.totalGross);
      const paid = invoice.payments.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
      acc.totalGross += gross;
      if (invoice.status === InvoiceStatus.PAID) acc.paidCount += 1;
      if (invoice.status === InvoiceStatus.OVERDUE || (invoice.status !== InvoiceStatus.PAID && invoice.status !== InvoiceStatus.CANCELLED && invoice.dueDate && invoice.dueDate < now)) acc.overdueCount += 1;
      if (invoice.status !== InvoiceStatus.CANCELLED) acc.openAmount += Math.max(0, gross - paid);
      return acc;
    }, { total, paidCount: 0, overdueCount: 0, openAmount: 0, totalGross: 0 });

    return c.json({
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      summary,
    });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const invoiceId = requireParam(c, 'id');

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId, deletedAt: null },
      include: {
        contact: { select: { id: true, name: true, taxNumber: true, address: true, email: true, phone: true } },
        lines: {
          include: {
            product: { select: { id: true, code: true, name: true } },
            taxRate: { select: { id: true, name: true, rate: true } },
            withholdingRate: { select: { id: true, name: true, rate: true } },
          },
        },
        payments: {
          include: {
            payment: true,
          },
        },
        eDocuments: true,
      },
    });

    if (!invoice) {
      return c.json(new NotFoundError('Fatura', invoiceId).toJSON(), 404);
    }

    const formattedInvoice = {
      ...invoice,
      payments: invoice.payments.map((alloc) => ({
        id: alloc.id,
        paymentId: alloc.paymentId,
        amount: Number(alloc.amount),
        date: alloc.payment?.date ? alloc.payment.date.toISOString() : alloc.createdAt.toISOString(),
        method: alloc.payment?.method ?? 'CASH',
        direction: alloc.payment?.direction ?? 'RECEIVE',
        reference: alloc.payment?.reference ?? null,
        status: alloc.payment?.status ?? 'COMPLETED',
        notes: alloc.payment?.notes ?? null,
      })),
    };

    return c.json({ data: formattedInvoice });
  },

  async getHistory(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const invoiceId = c.req.param('id');

    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId, deletedAt: null } });
    if (!invoice) return c.json(new NotFoundError('Fatura', invoiceId).toJSON(), 404);

    const history = await prisma.invoiceHistory.findMany({
      where: { tenantId, invoiceId },
      orderBy: { createdAt: 'desc' },
    });

    return c.json({ data: history });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.get('userId') as string | undefined;
    const { ipAddress, userAgent } = getRequestMeta(c);

    const body = getValidatedBody(c, createInvoiceBodySchema);

    if (!body.contactId || !body.type || !body.date || !body.lines?.length) {
      return c.json(
        new ValidationError('contactId, type, date ve en az bir satır zorunludur.').toJSON(),
        400,
      );
    }

    const contact = await prisma.contact.findFirst({
      where: { id: body.contactId, tenantId, deletedAt: null },
    });
    if (!contact) {
      return c.json(new NotFoundError('Cari hesap', body.contactId).toJSON(), 404);
    }

    if (body.salesOrderId && body.purchaseOrderId) {
      return c.json(new ValidationError('Fatura ayni anda hem satis hem alis siparisine baglanamaz.').toJSON(), 400);
    }
    if (body.salesOrderId) {
      if (body.type !== InvoiceType.SALES) {
        return c.json(new ValidationError('Satis siparisine yalnizca SALES faturasi baglanabilir.').toJSON(), 400);
      }
      const order = await prisma.salesOrder.findFirst({ where: { id: body.salesOrderId, tenantId, deletedAt: null } });
      if (!order) return c.json(new NotFoundError('Satis siparisi', body.salesOrderId).toJSON(), 404);
      if (order.contactId !== body.contactId) return c.json(new ValidationError('Fatura carisi bagli satis siparisi carisi ile ayni olmalidir.').toJSON(), 400);
    }
    if (body.purchaseOrderId) {
      if (body.type !== InvoiceType.PURCHASE) {
        return c.json(new ValidationError('Alis siparisine yalnizca PURCHASE faturasi baglanabilir.').toJSON(), 400);
      }
      const order = await prisma.purchaseOrder.findFirst({ where: { id: body.purchaseOrderId, tenantId, deletedAt: null } });
      if (!order) return c.json(new NotFoundError('Alis siparisi', body.purchaseOrderId).toJSON(), 404);
      if (order.contactId !== body.contactId) return c.json(new ValidationError('Fatura carisi bagli alis siparisi carisi ile ayni olmalidir.').toJSON(), 400);
    }

    await validateTenantOwnership(
      tenantId,
      buildOwnershipChecks(body.lines.flatMap((line, index) => [
        { model: 'product', id: line.productId, label: `Fatura satiri ${index + 1} urunu` },
        { model: 'taxRate', id: line.taxRateId, label: `Fatura satiri ${index + 1} vergi orani` },
        { model: 'taxRate', id: line.withholdingRateId, label: `Fatura satiri ${index + 1} tevkifat orani` },
      ])),
    );

    const { lineData, totalNet, totalTax, totalWithholding, totalGross } = await computeLineTotals(
      body.lines,
      tenantId,
    );

    if (body.salesOrderId) {
      const order = await prisma.salesOrder.findFirstOrThrow({ where: { id: body.salesOrderId, tenantId }, select: { totalGross: true } });
      const existing = await prisma.invoice.aggregate({
        where: { tenantId, salesOrderId: body.salesOrderId, deletedAt: null, status: { not: InvoiceStatus.CANCELLED } },
        _sum: { totalGross: true },
      });
      const remaining = Number(order.totalGross) - Number(existing._sum.totalGross ?? 0);
      if (totalGross > remaining + 0.005) {
        return c.json(new ValidationError(`Fatura tutari siparisin kalan faturalanabilir tutarini asamaz (${remaining.toFixed(2)}).`).toJSON(), 400);
      }
    }

    let number = body.number;
    if (!number) {
      number = await generateDocumentNumber(tenantId, 'invoice', 'INV-', 'invoice');
    } else {
      const duplicate = await prisma.invoice.findUnique({ where: { tenantId_number: { tenantId, number } }, select: { id: true } });
      if (duplicate) throw new ConflictError(`"${number}" fatura numarasi zaten kullaniliyor.`);
    }
    const invoiceDate = new Date(body.date);
    const invoiceDueDays = await businessRulesService.getNumber(tenantId, 'invoicing.invoice_due_days');
    const dueDate = body.dueDate ? new Date(body.dueDate) : addDays(invoiceDate, invoiceDueDays);

    const invoice = await prisma.$transaction(async (tx) => {
      const newInvoice = await tx.invoice.create({
        data: {
          tenantId,
          contactId: body.contactId,
          salesOrderId: body.salesOrderId ?? null,
          purchaseOrderId: body.purchaseOrderId ?? null,
          type: body.type,
          status: InvoiceStatus.DRAFT,
          number: number!,
          date: invoiceDate,
          dueDate,
          notes: body.notes ?? null,
          totalNet,
          totalTax,
          totalWithholding,
          totalGross,
          lines: {
            create: lineData.map((l) => ({ ...l, tenantId })),
          },
        },
        include: {
          lines: true,
          contact: { select: { id: true, name: true } },
        },
      });

      // History kaydı
      await tx.invoiceHistory.create({
        data: { tenantId, invoiceId: newInvoice.id, toStatus: InvoiceStatus.DRAFT, notes: 'Fatura oluşturuldu' },
      });

      // SalesOrder.invoicedAmount güncelle
      if (body.salesOrderId && (body.type === 'SALES' || body.type === 'RETURN_SALES')) {
        await tx.salesOrder.updateMany({
          where: { id: body.salesOrderId, tenantId },
          data: { invoicedAmount: { increment: totalGross } },
        });
      }

      return newInvoice;
    });

    // Audit log (fire-and-forget)
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'invoicing',
      entityType: EntityType.INVOICE,
      entityId: invoice.id,
      action: AuditAction.CREATE,
      newValues: { number: invoice.number, type: body.type, totalGross, contactId: body.contactId },
      ipAddress,
      userAgent,
    });

    await domainEvents.publish({
      name: 'invoice.created',
      context: createEventContext({ tenantId, userId }),
      payload: {
        invoiceId: invoice.id,
        number: invoice.number,
        contactId: invoice.contact.id,
        contactName: invoice.contact.name,
        totalGross: Number(invoice.totalGross),
        dueDate: invoice.dueDate,
      },
    });

    return c.json({ data: invoice }, 201);
  },

  async approve(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.get('userId') as string | undefined;
    const invoiceId = requireParam(c, 'id');
    const body = await c.req.json<unknown>();
    const idempotencyKey = parseIdempotencyKey(
      typeof body === 'object' && body !== null && 'idempotencyKey' in body
        ? body.idempotencyKey
        : undefined,
    );
    const { ipAddress, userAgent } = getRequestMeta(c);
    const result = await salesApplication.approveInvoice.execute({ tenantId, invoiceId, userId, idempotencyKey });
    await createAuditLog(prisma, {
      tenantId, userId, module: 'invoicing', entityType: EntityType.INVOICE, entityId: invoiceId,
      action: AuditAction.UPDATE,
      oldValues: { status: InvoiceStatus.DRAFT },
      newValues: { status: result.status, journalEntryId: result.journalEntryId },
      ipAddress, userAgent,
    });
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId, deletedAt: null },
      include: {
        contact: { select: { id: true, name: true, taxNumber: true, email: true } },
        lines: { include: { product: { select: { id: true, code: true, name: true } }, taxRate: true } },
        payments: { include: { payment: true } },
        eDocuments: true,
      },
    });
    if (!invoice) throw new NotFoundError('Fatura', invoiceId);
    const formattedInvoice = {
      ...invoice,
      payments: invoice.payments.map((allocation) => ({
        id: allocation.id,
        paymentId: allocation.paymentId,
        amount: Number(allocation.amount),
        date: allocation.payment?.date
          ? allocation.payment.date.toISOString()
          : allocation.createdAt.toISOString(),
        method: allocation.payment?.method ?? 'CASH',
        direction: allocation.payment?.direction ?? 'RECEIVE',
        reference: allocation.payment?.reference ?? null,
        status: allocation.payment?.status ?? 'COMPLETED',
        notes: allocation.payment?.notes ?? null,
      })),
    };
    const eDocumentAutomation = new EDocumentAutomationService(prisma);
    void eDocumentAutomation.autoCreateAndSendEDocument(tenantId, invoice.id, idempotencyKey).catch(() => undefined);
    return c.json({ data: formattedInvoice });
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.get('userId') as string | undefined;
    const { ipAddress, userAgent } = getRequestMeta(c);
    const invoiceId = c.req.param('id');

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId, deletedAt: null },
    });
    if (!invoice) {
      return c.json(new NotFoundError('Fatura', invoiceId).toJSON(), 404);
    }

    if (invoice.status !== InvoiceStatus.DRAFT) {
      return c.json(
        new ValidationError('Sadece taslak faturalar düzenlenebilir.').toJSON(),
        400,
      );
    }

    const body = getValidatedBody(c, updateInvoiceBodySchema);
    if (body.status !== undefined) {
      if (isComputedInvoiceStatus(body.status)) {
        return c.json(
          new ValidationError('PAID, PARTIALLY_PAID ve OVERDUE durumlari odeme/vade verisinden otomatik hesaplanir.').toJSON(),
          400,
        );
      }
      assertInvoiceStatusTransition(invoice.status, body.status);
    }

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.status !== undefined && { status: body.status }),
      },
    });

    if (body.status && body.status !== invoice.status) {
      await prisma.invoiceHistory.create({
        data: { tenantId, invoiceId: invoiceId!, fromStatus: invoice.status, toStatus: body.status },
      });

      await createAuditLog(prisma, {
        tenantId, userId, module: 'invoicing',
        entityType: EntityType.INVOICE, entityId: invoiceId!,
        action: AuditAction.UPDATE,
        oldValues: { status: invoice.status },
        newValues: { status: body.status },
        ipAddress, userAgent,
      });
    }

    return c.json({ data: updated });
  },

  async cancel(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.get('userId') as string | undefined;
    const { ipAddress, userAgent } = getRequestMeta(c);
    const invoiceId = c.req.param('id');

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId, deletedAt: null },
    });
    if (!invoice) {
      return c.json(new NotFoundError('Fatura', invoiceId).toJSON(), 404);
    }

    // Central guards & reason parse
    assertInvoiceCancelable(invoice, 'Fatura iptali');
    const allocationCount = await prisma.paymentAllocation.count({ where: { tenantId, invoiceId } });
    if (allocationCount > 0) {
      return c.json(new ValidationError('Tahsilat veya odeme kaydi bulunan fatura iptal edilemez. Once bagli odemeyi ters cevirin.').toJSON(), 400);
    }

    let body: Record<string, unknown> = {};
    try {
      body = await c.req.json() as Record<string, unknown>;
    } catch {
      // Fallback for testing / empty body
    }

    const reason = readRequiredReason(body);

    const cancellationDate = new Date();
    await assertAccountingPeriodOpen(prisma, tenantId, cancellationDate, 'Fatura iptali');

    /*
      return c.json(new ValidationError('Fatura zaten iptal edilmiş.').toJSON(), 400);
    }

    if (invoice.status === InvoiceStatus.PAID) {
      return c.json(new ValidationError('Ödenmiş fatura iptal edilemez.').toJSON(), 400);
    }

    */
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: InvoiceStatus.CANCELLED },
      });

      await tx.invoiceHistory.create({
        data: { tenantId, invoiceId: invoiceId!, fromStatus: invoice.status, toStatus: InvoiceStatus.CANCELLED, notes: `İptal nedeni: ${reason}` },
      });

      const postedEntry = await tx.accountEntry.findFirst({
        where: { tenantId, refType: 'INVOICE', refId: invoiceId! },
        select: { id: true },
      });
      if (postedEntry) {
        await reverseInvoiceAccountEntry(tx, {
          tenantId,
          contactId: invoice.contactId,
          invoiceId: invoiceId!,
          invoiceNumber: invoice.number,
          invoiceType: invoice.type,
          totalGross: Number(invoice.totalGross),
          date: cancellationDate,
          reason,
          userId,
        });
      }

      // SalesOrder.invoicedAmount geri al
      if (invoice.salesOrderId && (invoice.type === 'SALES' || invoice.type === 'RETURN_SALES')) {
        await tx.salesOrder.updateMany({
          where: { id: invoice.salesOrderId, tenantId },
          data: { invoicedAmount: { decrement: Number(invoice.totalGross) } },
        });
      }

      return result;
    });

    await createAuditLog(prisma, {
      tenantId, userId, module: 'invoicing',
      entityType: EntityType.INVOICE, entityId: invoiceId!,
      action: AuditAction.UPDATE,
      oldValues: { status: invoice.status },
      newValues: { status: InvoiceStatus.CANCELLED, reason },
      ipAddress, userAgent,
    });

    return c.json({ data: updated });
  },
};
