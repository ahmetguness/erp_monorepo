import { AuditAction,ContactType,EntityType,Prisma,type Contact } from '@prisma/client';
import { Context } from 'hono';
import { z } from 'zod';
import { NotFoundError,ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { getContactInsights } from '../../../../services/contact-insights.service.js';
import { CustomerTrackingService } from '../../../../services/customer-tracking.service.js';
import { getSupplierPerformanceScore } from '../../../../services/supplier-performance.service.js';
import { createAuditLog,getRequestMeta } from '../../../../utils/audit.js';
import { requireTenantId,requireUserId } from '../../../../utils/context.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface CreateContactDTO {
  type: ContactType;
  name: string;
  code?: string;
  taxNumber?: string;
  taxOffice?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  country?: string;
  notes?: string;
  creditLimit?: number;
  paymentTermDays?: number;
  tags?: string[];
}

interface UpdateContactDTO extends Partial<Omit<CreateContactDTO, 'type'>> {
  isActive?: boolean;
}

const optionalTrimmedString = (max: number) => z.string().trim().max(max).optional();

const contactCreateSchema = z.object({
  type: z.nativeEnum(ContactType),
  name: z.string().trim().min(1, 'Ad / unvan zorunludur.').max(200),
  code: optionalTrimmedString(50),
  taxNumber: z.string().trim().regex(/^\d{10,11}$/, 'Vergi / TC kimlik no 10 veya 11 haneli olmalıdır.').optional(),
  taxOffice: optionalTrimmedString(100),
  email: z.string().trim().email('Geçerli bir e-posta adresi girilmelidir.').max(254).optional(),
  phone: z.string().trim().regex(/^[\d\s+\-()]{7,20}$/, 'Geçerli bir telefon numarası girilmelidir.').optional(),
  website: z.string().trim().url('Geçerli bir web adresi girilmelidir.').max(2048).optional(),
  address: optionalTrimmedString(1000),
  city: optionalTrimmedString(100),
  country: z.string().trim().length(2).optional(),
  notes: optionalTrimmedString(1000),
  creditLimit: z.number().finite().min(0, 'Kredi limiti negatif olamaz.').max(9999999999999999.99).optional(),
  paymentTermDays: z.number().int().min(0, 'Ödeme vadesi negatif olamaz.').max(3650).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
}).strict();

const contactUpdateSchema = contactCreateSchema.omit({ type: true }).partial().extend({
  isActive: z.boolean().optional(),
});

function validationMessage(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
}

interface ContactListQuery {
  page?: string;
  limit?: string;
  search?: string;
  type?: ContactType;
  isActive?: string;
  balanceFilter?: 'receivable' | 'payable' | 'risky';
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

interface CustomerTrackingQuery {
  limit?: string;
}

function toContactAuditSnapshot(contact: Contact): Prisma.InputJsonObject {
  return {
    type: contact.type,
    name: contact.name,
    code: contact.code,
    taxNumber: contact.taxNumber,
    taxOffice: contact.taxOffice,
    email: contact.email,
    phone: contact.phone,
    website: contact.website,
    address: contact.address,
    city: contact.city,
    country: contact.country,
    notes: contact.notes,
    tags: contact.tags,
    creditLimit: contact.creditLimit === null ? null : Number(contact.creditLimit),
    paymentTermDays: contact.paymentTermDays,
    isActive: contact.isActive,
  };
}

const customerTrackingService = new CustomerTrackingService(prisma);

// ─────────────────────────────────────────────
// Contact Controller
// ─────────────────────────────────────────────

export const ContactController = {
  async trackingDashboard(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const query = c.req.query() as CustomerTrackingQuery;
    const dashboard = await customerTrackingService.dashboard(tenantId, Number(query.limit ?? 8));
    return c.json({ data: dashboard });
  },

  /**
   * LIST — returns contacts with aggregated financial data:
   *   currentBalance, totalDebit, totalCredit, openInvoiceCount,
   *   lastTransactionDate, riskLevel
   */
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as ContactListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '25', 10)));
    const skip = (page - 1) * pageSize;

    // Base where clause
    const where: Prisma.ContactWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.type && { type: query.type }),
      ...(query.isActive !== undefined && { isActive: query.isActive === 'true' }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { code: { contains: query.search, mode: 'insensitive' as const } },
          { email: { contains: query.search, mode: 'insensitive' as const } },
          { taxNumber: { contains: query.search, mode: 'insensitive' as const } },
          { phone: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    // Sorting
    const sortBy = query.sortBy ?? 'name';
    const sortDir = query.sortDir ?? 'asc';
    const validSortFields = ['name', 'code', 'createdAt', 'updatedAt'];
    const orderBy = validSortFields.includes(sortBy)
      ? { [sortBy]: sortDir }
      : { name: 'asc' as const };

    // Balance/risk values are derived from account entries, so they must be
    // calculated before filtering and pagination. Fetching only one page here
    // caused matching rows on later pages to disappear from filtered page 1.
    const contacts = await prisma.contact.findMany({ where, orderBy });

    // Aggregate financial data for every contact matching the base filters.
    const contactIds = contacts.map((c) => c.id);

    // Balance aggregation: SUM(debit) - SUM(credit) per contact
    const balanceAgg = contactIds.length > 0
      ? await prisma.accountEntry.groupBy({
          by: ['contactId'],
          where: { contactId: { in: contactIds }, tenantId },
          _sum: { debit: true, credit: true },
          _max: { date: true },
        })
      : [];

    // Open invoices count per contact
    const openInvoiceAgg = contactIds.length > 0
      ? await prisma.invoice.groupBy({
          by: ['contactId'],
          where: {
            contactId: { in: contactIds },
            tenantId,
            deletedAt: null,
            status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
          },
          _count: true,
        })
      : [];

    // Overdue invoices count per contact
    const overdueAgg = contactIds.length > 0
      ? await prisma.invoice.groupBy({
          by: ['contactId'],
          where: {
            contactId: { in: contactIds },
            tenantId,
            deletedAt: null,
            status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
            dueDate: { lt: new Date() },
          },
          _count: true,
        })
      : [];

    // Build lookup maps
    const balanceMap = new Map(balanceAgg.map((b) => [b.contactId, {
      totalDebit: Number(b._sum.debit ?? 0),
      totalCredit: Number(b._sum.credit ?? 0),
      currentBalance: Number(b._sum.debit ?? 0) - Number(b._sum.credit ?? 0),
      lastTransactionDate: b._max.date?.toISOString() ?? null,
    }]));

    const openInvoiceMap = new Map(openInvoiceAgg.map((o) => [o.contactId, o._count]));
    const overdueMap = new Map(overdueAgg.map((o) => [o.contactId, o._count]));

    // Enrich contacts
    const enriched = contacts.map((contact) => {
      const fin = balanceMap.get(contact.id) ?? {
        totalDebit: 0, totalCredit: 0, currentBalance: 0, lastTransactionDate: null,
      };
      const creditLimit = Number(contact.creditLimit ?? 0);
      const insights = getContactInsights({
        type: contact.type,
        taxNumber: contact.taxNumber,
        taxOffice: contact.taxOffice,
        email: contact.email,
        phone: contact.phone,
        address: contact.address,
        creditLimit,
        paymentTermDays: contact.paymentTermDays,
        currentBalance: fin.currentBalance,
        overdueInvoiceCount: overdueMap.get(contact.id) ?? 0,
      });

      return {
        ...contact,
        creditLimit: Number(contact.creditLimit ?? 0),
        ...fin,
        openInvoiceCount: openInvoiceMap.get(contact.id) ?? 0,
        overdueInvoiceCount: overdueMap.get(contact.id) ?? 0,
        ...insights,
      };
    });

    // Filtering -> sorting (the Prisma result is already ordered) -> pagination.
    let filtered = enriched;
    if (query.balanceFilter === 'receivable') {
      filtered = enriched.filter((c) => c.currentBalance > 0);
    } else if (query.balanceFilter === 'payable') {
      filtered = enriched.filter((c) => c.currentBalance < 0);
    } else if (query.balanceFilter === 'risky') {
      filtered = enriched.filter((c) => c.riskLevel === 'exceeded' || c.riskLevel === 'warning');
    }
    const total = filtered.length;
    const paginated = filtered.slice(skip, skip + pageSize);

    const summary = {
      totalReceivable: filtered.reduce((sum, item) => sum + item.totalDebit, 0),
      totalPayable: filtered.reduce((sum, item) => sum + item.totalCredit, 0),
      netBalance: filtered.reduce((sum, item) => sum + item.currentBalance, 0),
      riskyAccountCount: filtered.filter((item) => item.riskLevel === 'exceeded' || item.riskLevel === 'warning').length,
      missingInfoCount: filtered.filter((item) => item.hasMissingInfo).length,
      customerCount: filtered.filter((item) => item.type === ContactType.CUSTOMER).length,
      supplierCount: filtered.filter((item) => item.type === ContactType.SUPPLIER).length,
      bothCount: filtered.filter((item) => item.type === ContactType.BOTH).length,
      totalAccounts: total,
    };

    return c.json({
      data: paginated,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      summary,
    });
  },

  /**
   * GET BY ID — returns contact with full financial summary
   */
  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const contactId = c.req.param('id');

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, tenantId, deletedAt: null },
    });

    if (!contact) {
      return c.json(new NotFoundError('Cari hesap', contactId).toJSON(), 404);
    }

    // Aggregated financial summary
    const balanceAgg = await prisma.accountEntry.aggregate({
      where: { contactId, tenantId },
      _sum: { debit: true, credit: true },
      _max: { date: true },
      _count: true,
    });

    const openInvoices = await prisma.invoice.findMany({
      where: {
        contactId, tenantId, deletedAt: null,
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      select: {
        id: true, number: true, date: true, dueDate: true,
        status: true, totalGross: true, type: true,
      },
      orderBy: { dueDate: 'asc' },
    });

    const overdueCount = openInvoices.filter(
      (inv) => inv.dueDate && new Date(inv.dueDate) < new Date()
    ).length;

    const totalDebit = Number(balanceAgg._sum.debit ?? 0);
    const totalCredit = Number(balanceAgg._sum.credit ?? 0);
    const currentBalance = totalDebit - totalCredit;
    const creditLimit = Number(contact.creditLimit ?? 0);
    const insights = getContactInsights({
      type: contact.type,
      taxNumber: contact.taxNumber,
      taxOffice: contact.taxOffice,
      email: contact.email,
      phone: contact.phone,
      address: contact.address,
      creditLimit,
      paymentTermDays: contact.paymentTermDays,
      currentBalance,
      overdueInvoiceCount: overdueCount,
    });

    return c.json({
      data: {
        ...contact,
        creditLimit,
        financials: {
          totalDebit,
          totalCredit,
          currentBalance,
          lastTransactionDate: balanceAgg._max.date?.toISOString() ?? null,
          transactionCount: balanceAgg._count,
          openInvoiceCount: openInvoices.length,
          overdueInvoiceCount: overdueCount,
          riskLevel: insights.riskLevel,
          riskRatio: insights.riskRatio,
          riskScore: insights.riskScore,
          riskScoreLevel: insights.riskScoreLevel,
        },
        missingInfoKeys: insights.missingInfoKeys,
        missingInfoCount: insights.missingInfoCount,
        hasMissingInfo: insights.hasMissingInfo,
        openInvoices: openInvoices.map((inv) => ({
          ...inv,
          totalGross: Number(inv.totalGross),
          isOverdue: inv.dueDate ? new Date(inv.dueDate) < new Date() : false,
        })),
      },
    });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    const parsedBody = contactCreateSchema.safeParse(await c.req.json<unknown>());
    if (!parsedBody.success) {
      return c.json(new ValidationError(validationMessage(parsedBody.error)).toJSON(), 400);
    }
    const body: CreateContactDTO = parsedBody.data;

    if (!body.type || !body.name) {
      return c.json(new ValidationError('type ve name alanları zorunludur.').toJSON(), 400);
    }

    if (!Object.values(ContactType).includes(body.type)) {
      return c.json(new ValidationError(`Geçersiz contact tipi: ${body.type}`).toJSON(), 400);
    }

    // Auto-generate code if not provided
    let code = body.code ?? null;
    if (!code) {
      const prefix = body.type === 'CUSTOMER' ? 'MUS' : body.type === 'SUPPLIER' ? 'TED' : 'CAR';
      const lastContact = await prisma.contact.findFirst({
        where: { tenantId, code: { startsWith: prefix } },
        orderBy: { code: 'desc' },
        select: { code: true },
      });
      const lastNum = lastContact?.code
        ? parseInt(lastContact.code.replace(prefix, ''), 10) || 0
        : 0;
      code = `${prefix}${String(lastNum + 1).padStart(5, '0')}`;
    }

    if (code) {
      const existing = await prisma.contact.findUnique({
        where: { tenantId_code: { tenantId, code } },
      });
      if (existing) {
        return c.json(new ValidationError(`"${code}" kodu zaten kullanımda.`).toJSON(), 400);
      }
    }

    const contact = await prisma.contact.create({
      data: {
        tenantId,
        type: body.type,
        name: body.name,
        code,
        taxNumber: body.taxNumber ?? null,
        taxOffice: body.taxOffice ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        website: body.website ?? null,
        address: body.address ?? null,
        city: body.city ?? null,
        country: body.country ?? 'TR',
        notes: body.notes ?? null,
        tags: body.tags ?? [],
        creditLimit: body.creditLimit ?? null,
        paymentTermDays: body.paymentTermDays ?? null,
      },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'contacts',
      entityType: EntityType.CONTACT,
      entityId: contact.id,
      action: AuditAction.CREATE,
      newValues: toContactAuditSnapshot(contact),
      ...getRequestMeta(c),
    });

    return c.json({ data: contact }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const contactId = c.req.param('id');
    if (!contactId) {
      return c.json(new ValidationError('Cari hesap id zorunludur.').toJSON(), 400);
    }

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, tenantId, deletedAt: null },
    });
    if (!contact) {
      return c.json(new NotFoundError('Cari hesap', contactId).toJSON(), 404);
    }

    const parsedBody = contactUpdateSchema.safeParse(await c.req.json<unknown>());
    if (!parsedBody.success) {
      return c.json(new ValidationError(validationMessage(parsedBody.error)).toJSON(), 400);
    }
    const body: UpdateContactDTO = parsedBody.data;

    if (body.code !== undefined && body.code !== contact.code) {
      const duplicate = await prisma.contact.findUnique({
        where: { tenantId_code: { tenantId, code: body.code } },
        select: { id: true },
      });
      if (duplicate) {
        return c.json(new ValidationError(`"${body.code}" kodu zaten kullanımda.`).toJSON(), 400);
      }
    }

    const updated = await prisma.contact.update({
      where: { id: contactId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.code !== undefined && { code: body.code }),
        ...(body.taxNumber !== undefined && { taxNumber: body.taxNumber }),
        ...(body.taxOffice !== undefined && { taxOffice: body.taxOffice }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.website !== undefined && { website: body.website }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.city !== undefined && { city: body.city }),
        ...(body.country !== undefined && { country: body.country }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.creditLimit !== undefined && { creditLimit: body.creditLimit }),
        ...(body.paymentTermDays !== undefined && { paymentTermDays: body.paymentTermDays }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'contacts',
      entityType: EntityType.CONTACT,
      entityId: contactId,
      action: AuditAction.UPDATE,
      oldValues: toContactAuditSnapshot(contact),
      newValues: toContactAuditSnapshot(updated),
      ...getRequestMeta(c),
    });

    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const contactId = c.req.param('id');
    if (!contactId) {
      return c.json(new ValidationError('Cari hesap id zorunludur.').toJSON(), 400);
    }

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, tenantId, deletedAt: null },
    });
    if (!contact) {
      return c.json(new NotFoundError('Cari hesap', contactId).toJSON(), 404);
    }

    await prisma.contact.update({
      where: { id: contactId },
      data: { deletedAt: new Date() },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'contacts',
      entityType: EntityType.CONTACT,
      entityId: contactId,
      action: AuditAction.DELETE,
      oldValues: toContactAuditSnapshot(contact),
      ...getRequestMeta(c),
    });

    return c.json({ data: { success: true } });
  },

  async getPerformanceScore(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id');
    if (!id) {
      return c.json(new ValidationError('contact id zorunludur.').toJSON(), 400);
    }

    const contact = await prisma.contact.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!contact) return c.json(new NotFoundError('Cari hesap', id).toJSON(), 404);

    const performanceScore = await getSupplierPerformanceScore(prisma, tenantId, id);

    return c.json({ data: performanceScore });
  },
};


// ─────────────────────────────────────────────
// AccountEntry — cari hesap hareketleri
// ─────────────────────────────────────────────

interface AccountEntryListQuery {
  page?: string;
  limit?: string;
  dateFrom?: string;
  dateTo?: string;
  refType?: string;
}

export const AccountEntryController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const contactId = c.req.param('contactId');

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, tenantId, deletedAt: null },
    });
    if (!contact) return c.json(new NotFoundError('Cari hesap', contactId).toJSON(), 404);

    const query = c.req.query() as AccountEntryListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));

    const where: Prisma.AccountEntryWhereInput = {
      tenantId,
      contactId,
      ...(query.refType && { refType: query.refType }),
      ...(query.dateFrom || query.dateTo
        ? {
            date: {
              ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
              ...(query.dateTo && { lte: new Date(query.dateTo) }),
            },
          }
        : {}),
    };

    const [total, entries] = await prisma.$transaction([
      prisma.accountEntry.count({ where }),
      prisma.accountEntry.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // Period totals for the filtered range
    const periodAgg = await prisma.accountEntry.aggregate({
      where,
      _sum: { debit: true, credit: true },
    });

    return c.json({
      data: entries,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      periodTotals: {
        debit: Number(periodAgg._sum.debit ?? 0),
        credit: Number(periodAgg._sum.credit ?? 0),
      },
    });
  },
};
