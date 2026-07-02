import { Context } from 'hono';
import { AuditAction, ContactType, EntityType, Prisma, type Contact } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { requireTenantId, requireUserId } from '../utils/context.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';
import { CustomerTrackingService } from '../services/customer-tracking.service.js';

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

    const [total, contacts] = await prisma.$transaction([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
      }),
    ]);

    // Aggregate financial data for all contacts in this page
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
      const usedCredit = Math.max(fin.currentBalance, 0);
      const riskRatio = creditLimit > 0 ? usedCredit / creditLimit : 0;

      let riskLevel: 'safe' | 'warning' | 'exceeded' | 'none' = 'none';
      if (creditLimit > 0) {
        if (riskRatio > 1) riskLevel = 'exceeded';
        else if (riskRatio > 0.8) riskLevel = 'warning';
        else riskLevel = 'safe';
      }

      return {
        ...contact,
        creditLimit: Number(contact.creditLimit ?? 0),
        ...fin,
        openInvoiceCount: openInvoiceMap.get(contact.id) ?? 0,
        overdueInvoiceCount: overdueMap.get(contact.id) ?? 0,
        riskLevel,
        riskRatio: Math.round(riskRatio * 100),
      };
    });

    // Post-filter by balance (can't do in Prisma where clause)
    let filtered = enriched;
    if (query.balanceFilter === 'receivable') {
      filtered = enriched.filter((c) => c.currentBalance > 0);
    } else if (query.balanceFilter === 'payable') {
      filtered = enriched.filter((c) => c.currentBalance < 0);
    } else if (query.balanceFilter === 'risky') {
      filtered = enriched.filter((c) => c.riskLevel === 'exceeded' || c.riskLevel === 'warning');
    }

    // Summary totals for the entire filtered set (across all pages)
    const summaryAgg = await prisma.accountEntry.aggregate({
      where: { tenantId, contact: { deletedAt: null, ...( query.type ? { type: query.type } : {}) } },
      _sum: { debit: true, credit: true },
    });

    const riskyCount = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT c.id)::bigint as count
      FROM contacts c
      LEFT JOIN (
        SELECT "contactId", SUM(debit) - SUM(credit) as balance
        FROM account_entries
        WHERE "tenantId" = ${tenantId}
        GROUP BY "contactId"
      ) ae ON ae."contactId" = c.id
      WHERE c."tenantId" = ${tenantId}
        AND c."deletedAt" IS NULL
        AND c."creditLimit" IS NOT NULL
        AND c."creditLimit" > 0
        AND COALESCE(ae.balance, 0) > c."creditLimit" * 0.8
    `;

    const summary = {
      totalReceivable: Number(summaryAgg._sum.debit ?? 0),
      totalPayable: Number(summaryAgg._sum.credit ?? 0),
      netBalance: Number(summaryAgg._sum.debit ?? 0) - Number(summaryAgg._sum.credit ?? 0),
      riskyAccountCount: Number(riskyCount[0]?.count ?? 0),
      totalAccounts: total,
    };

    return c.json({
      data: filtered,
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
    const usedCredit = Math.max(currentBalance, 0);
    const riskRatio = creditLimit > 0 ? usedCredit / creditLimit : 0;

    let riskLevel: 'safe' | 'warning' | 'exceeded' | 'none' = 'none';
    if (creditLimit > 0) {
      if (riskRatio > 1) riskLevel = 'exceeded';
      else if (riskRatio > 0.8) riskLevel = 'warning';
      else riskLevel = 'safe';
    }

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
          riskLevel,
          riskRatio: Math.round(riskRatio * 100),
        },
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

    const body = await c.req.json<CreateContactDTO>();

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

    const body = await c.req.json<UpdateContactDTO>();

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

    const contact = await prisma.contact.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!contact) return c.json(new NotFoundError('Cari hesap', id).toJSON(), 404);

    const pos = await prisma.purchaseOrder.findMany({
      where: { contactId: id, tenantId, deletedAt: null },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        deliveryNotes: {
          where: { type: 'INBOUND', deletedAt: null },
          orderBy: { deliveredAt: 'desc' },
          take: 1,
        },
      },
    });

    let totalLeadTimeDays = 0;
    let leadTimeCount = 0;
    for (const po of pos) {
      const delivery = po.deliveryNotes[0];
      if (delivery && delivery.deliveredAt) {
        const diffMs = delivery.deliveredAt.getTime() - po.date.getTime();
        const diffDays = Math.max(0, diffMs / (1000 * 60 * 60 * 24));
        totalLeadTimeDays += diffDays;
        leadTimeCount++;
      }
    }
    const avgLeadTimeDays = leadTimeCount > 0 ? Number((totalLeadTimeDays / leadTimeCount).toFixed(1)) : 0;
    let leadTimeScore = 100;
    if (leadTimeCount > 0) {
      if (avgLeadTimeDays <= 3) leadTimeScore = 100;
      else if (avgLeadTimeDays <= 7) leadTimeScore = 85;
      else if (avgLeadTimeDays <= 14) leadTimeScore = 60;
      else leadTimeScore = 30;
    }

    let totalDeviationPct = 0;
    let itemPriceCount = 0;
    for (const po of pos) {
      for (const item of po.items) {
        const defaultPrice = Number(item.product.purchasePrice ?? 0);
        const actualPrice = Number(item.unitPrice);
        if (defaultPrice > 0) {
          const dev = (actualPrice - defaultPrice) / defaultPrice;
          totalDeviationPct += dev;
          itemPriceCount++;
        }
      }
    }
    const avgPriceDeviationPct = itemPriceCount > 0 ? Number((totalDeviationPct / itemPriceCount * 100).toFixed(1)) : 0;
    let priceDeviationScore = 100;
    if (itemPriceCount > 0) {
      if (avgPriceDeviationPct <= 0) priceDeviationScore = 100;
      else if (avgPriceDeviationPct <= 5) priceDeviationScore = 85;
      else if (avgPriceDeviationPct <= 10) priceDeviationScore = 70;
      else priceDeviationScore = 40;
    }

    const allDeliveryNotes = await prisma.deliveryNote.findMany({
      where: { contactId: id, tenantId, deletedAt: null },
    });
    const inboundNotes = allDeliveryNotes.filter(d => d.type === 'INBOUND');
    const returnNotes = allDeliveryNotes.filter(d => d.type === 'RETURN');
    const returnRatePct = inboundNotes.length > 0 ? Number((returnNotes.length / inboundNotes.length * 100).toFixed(1)) : 0;
    let returnRateScore = 100;
    if (inboundNotes.length > 0) {
      if (returnRatePct === 0) returnRateScore = 100;
      else if (returnRatePct <= 2) returnRateScore = 90;
      else if (returnRatePct <= 5) returnRateScore = 75;
      else if (returnRatePct <= 10) returnRateScore = 50;
      else returnRateScore = 20;
    }

    const openOrders = pos.filter(po => po.status === 'SENT' || po.status === 'PARTIALLY_RECEIVED');
    const overdueOrders = openOrders.filter(po => po.dueDate && po.dueDate.getTime() < Date.now());
    const openOrderRatio = pos.length > 0 ? (pos.length - overdueOrders.length) / pos.length : 1;
    const openOrderScore = Math.round(openOrderRatio * 100);

    let score = 100;
    if (pos.length > 0 || allDeliveryNotes.length > 0) {
      score = Math.round((leadTimeScore + priceDeviationScore + returnRateScore + openOrderScore) / 4);
    }

    return c.json({
      data: {
        score,
        leadTimeDays: avgLeadTimeDays,
        leadTimeScore,
        priceDeviationPct: avgPriceDeviationPct,
        priceDeviationScore,
        returnRatePct,
        returnRateScore,
        openOrderCount: openOrders.length,
        overdueOrderCount: overdueOrders.length,
        openOrderScore,
        totalOrders: pos.length,
      },
    });
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
