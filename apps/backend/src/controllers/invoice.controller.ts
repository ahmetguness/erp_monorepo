import { Context } from 'hono';
import { InvoiceType, InvoiceStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

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

// ─────────────────────────────────────────────
// Invoice Controller
// ─────────────────────────────────────────────

export const InvoiceController = {
  async list(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

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
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const invoiceId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        contact: { select: { id: true, name: true, taxNumber: true, address: true } },
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

  async create(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

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

    // Otomatik numara — NumberSequence yoksa timestamp fallback
    let number = body.number;
    if (!number) {
      const seq = await prisma.numberSequence.upsert({
        where: { tenantId_module: { tenantId, module: 'invoice' } },
        create: { tenantId, module: 'invoice', prefix: 'INV-', lastNum: 1, padding: 6 },
        update: { lastNum: { increment: 1 } },
      });
      number = `${seq.prefix}${String(seq.lastNum).padStart(seq.padding, '0')}`;
    }

    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        contactId: body.contactId,
        type: body.type,
        status: InvoiceStatus.DRAFT,
        number,
        date: new Date(body.date),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
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
    await prisma.invoiceHistory.create({
      data: { tenantId, invoiceId: invoice.id, toStatus: InvoiceStatus.DRAFT, notes: 'Fatura oluşturuldu' },
    });

    return c.json({ data: invoice }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const invoiceId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

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

    // Status değiştiyse history kaydı
    if (body.status && body.status !== invoice.status) {
      await prisma.invoiceHistory.create({
        data: { tenantId, invoiceId: invoiceId!, fromStatus: invoice.status, toStatus: body.status },
      });
    }

    return c.json({ data: updated });
  },

  async cancel(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const invoiceId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

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

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.CANCELLED },
    });

    await prisma.invoiceHistory.create({
      data: { tenantId, invoiceId: invoiceId!, fromStatus: invoice.status, toStatus: InvoiceStatus.CANCELLED, notes: 'Fatura iptal edildi' },
    });

    return c.json({ data: updated });
  },
};
