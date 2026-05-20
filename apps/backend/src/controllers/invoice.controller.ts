import { Context } from 'hono';
import { InvoiceType, InvoiceStatus, AuditAction, EntityType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { generateDocumentNumber } from '../utils/generate-number.js';
import { requireTenantId } from '../utils/context.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';
import { createEventContext, domainEvents } from '../domain-events';
import { writeInvoiceAccountEntry, reverseInvoiceAccountEntry } from '../utils/account-entry.js';
import { BusinessRulesService } from '../services/business-rules.service.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface InvoiceLineDTO {
  productId?: string;
  taxRateId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
}

interface CreateInvoiceDTO {
  contactId: string;
  type: InvoiceType;
  salesOrderId?: string;
  purchaseOrderId?: string;
  number?: string;
  date: string;
  dueDate?: string;
  notes?: string;
  lines: InvoiceLineDTO[];
}

interface UpdateInvoiceDTO {
  dueDate?: string;
  notes?: string;
  status?: InvoiceStatus;
}

interface InvoiceListQuery {
  page?: string;
  limit?: string;
  type?: InvoiceType;
  status?: InvoiceStatus;
  contactId?: string;
  dateFrom?: string;
  dateTo?: string;
}

const businessRulesService = new BusinessRulesService(prisma);

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
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxAmount: number;
    lineTotal: number;
  }>;
  totalNet: number;
  totalTax: number;
  totalGross: number;
}> {
  let totalNet = 0;
  let totalTax = 0;

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

      const taxAmount = net * (taxRate / 100);
      const lineTotal = net + taxAmount;

      totalNet += net;
      totalTax += taxAmount;

      return {
        productId: line.productId ?? null,
        taxRateId: line.taxRateId ?? null,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount,
        taxAmount,
        lineTotal,
      };
    }),
  );

  return { lineData, totalNet, totalTax, totalGross: totalNet + totalTax };
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
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as InvoiceListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      ...(query.type && { type: query.type }),
      ...(query.status && { status: query.status }),
      ...(query.contactId && { contactId: query.contactId }),
      ...(query.dateFrom || query.dateTo
        ? {
            date: {
              ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
              ...(query.dateTo && { lte: new Date(query.dateTo) }),
            },
          }
        : {}),
    };

    const [total, invoices] = await prisma.$transaction([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        include: {
          contact: { select: { id: true, name: true, code: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: invoices,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const invoiceId = c.req.param('id');

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        contact: { select: { id: true, name: true, taxNumber: true, address: true, email: true } },
        lines: {
          include: {
            product: { select: { id: true, code: true, name: true } },
            taxRate: { select: { id: true, name: true, rate: true } },
          },
        },
        payments: true,
        eDocuments: true,
      },
    });

    if (!invoice) {
      return c.json(new NotFoundError('Fatura', invoiceId).toJSON(), 404);
    }

    return c.json({ data: invoice });
  },

  async getHistory(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const invoiceId = c.req.param('id');

    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
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

    const body = await c.req.json<CreateInvoiceDTO>();

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

    const { lineData, totalNet, totalTax, totalGross } = await computeLineTotals(
      body.lines,
      tenantId,
    );

    let number = body.number;
    if (!number) {
      number = await generateDocumentNumber(tenantId, 'invoice', 'INV-', 'invoice');
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

      // AccountEntry: cari hesap hareketi
      await writeInvoiceAccountEntry(tx, {
        tenantId,
        contactId: body.contactId,
        invoiceId: newInvoice.id,
        invoiceNumber: newInvoice.number,
        invoiceType: body.type,
        totalGross,
        date: invoiceDate,
        userId,
      });

      // SalesOrder.invoicedAmount güncelle
      if (body.salesOrderId && (body.type === 'SALES' || body.type === 'RETURN_SALES')) {
        await tx.salesOrder.update({
          where: { id: body.salesOrderId },
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

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.get('userId') as string | undefined;
    const { ipAddress, userAgent } = getRequestMeta(c);
    const invoiceId = c.req.param('id');

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
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

    const body = await c.req.json<UpdateInvoiceDTO>();

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
      where: { id: invoiceId, tenantId },
    });
    if (!invoice) {
      return c.json(new NotFoundError('Fatura', invoiceId).toJSON(), 404);
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      return c.json(new ValidationError('Fatura zaten iptal edilmiş.').toJSON(), 400);
    }

    if (invoice.status === InvoiceStatus.PAID) {
      return c.json(new ValidationError('Ödenmiş fatura iptal edilemez.').toJSON(), 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: InvoiceStatus.CANCELLED },
      });

      await tx.invoiceHistory.create({
        data: { tenantId, invoiceId: invoiceId!, fromStatus: invoice.status, toStatus: InvoiceStatus.CANCELLED, notes: 'Fatura iptal edildi' },
      });

      // AccountEntry: ters kayıt
      await reverseInvoiceAccountEntry(tx, {
        tenantId,
        contactId: invoice.contactId,
        invoiceId: invoiceId!,
        invoiceNumber: invoice.number,
        invoiceType: invoice.type,
        totalGross: Number(invoice.totalGross),
        date: new Date(),
        userId,
      });

      // SalesOrder.invoicedAmount geri al
      if (invoice.salesOrderId && (invoice.type === 'SALES' || invoice.type === 'RETURN_SALES')) {
        await tx.salesOrder.update({
          where: { id: invoice.salesOrderId },
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
      newValues: { status: InvoiceStatus.CANCELLED },
      ipAddress, userAgent,
    });

    return c.json({ data: updated });
  },
};
