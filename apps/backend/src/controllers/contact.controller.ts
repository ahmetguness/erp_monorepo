import { Context } from 'hono';
import { ContactType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

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
}

// ─────────────────────────────────────────────
// Contact Controller
// ─────────────────────────────────────────────

export const ContactController = {
  async list(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const query = c.req.query() as ContactListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    const where = {
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
        ],
      }),
    };

    const [total, contacts] = await prisma.$transaction([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: contacts,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const contactId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, tenantId, deletedAt: null },
      include: {
        accountEntries: {
          orderBy: { date: 'desc' },
          take: 10,
        },
      },
    });

    if (!contact) {
      return c.json(new NotFoundError('Cari hesap', contactId).toJSON(), 404);
    }

    return c.json({ data: contact });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const body = await c.req.json<CreateContactDTO>();

    if (!body.type || !body.name) {
      return c.json(
        new ValidationError('type ve name alanları zorunludur.').toJSON(),
        400,
      );
    }

    if (!Object.values(ContactType).includes(body.type)) {
      return c.json(
        new ValidationError(`Geçersiz contact tipi: ${body.type}`).toJSON(),
        400,
      );
    }

    if (body.code) {
      const existing = await prisma.contact.findUnique({
        where: { tenantId_code: { tenantId, code: body.code } },
      });
      if (existing) {
        return c.json(
          new ValidationError(`"${body.code}" kodu zaten kullanımda.`).toJSON(),
          400,
        );
      }
    }

    const contact = await prisma.contact.create({
      data: {
        tenantId,
        type: body.type,
        name: body.name,
        code: body.code ?? null,
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

    return c.json({ data: contact }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const contactId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
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

    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const contactId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
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

    return c.json({ data: { success: true } });
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
}

export const AccountEntryController = {
  async list(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const contactId = c.req.param('contactId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    // Cari hesabın bu tenant'a ait olduğunu doğrula
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, tenantId, deletedAt: null },
    });
    if (!contact) return c.json(new NotFoundError('Cari hesap', contactId).toJSON(), 404);

    const query = c.req.query() as AccountEntryListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));

    const where = {
      tenantId,
      contactId,
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

    return c.json({
      data: entries,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },
};
