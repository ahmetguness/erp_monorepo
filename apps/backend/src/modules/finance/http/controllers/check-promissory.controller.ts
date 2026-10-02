import { CheckNoteType, CheckStatus } from '@prisma/client';
import { Context } from 'hono';
import { ConflictError, NotFoundError, ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { getValidatedBody } from '../../../../middleware/validateBody.js';
import { createCheckPromissoryBodySchema, updateCheckPromissoryBodySchema, updateCheckPromissoryStatusBodySchema, type CreateCheckPromissoryBody, type UpdateCheckPromissoryBody, type UpdateCheckPromissoryStatusBody } from '../../../../schemas/request-body.schemas.js';
import { requireParam, requireTenantId } from '../../../../utils/context.js';

interface ListQuery { page?: string; limit?: string; type?: CheckNoteType; status?: CheckStatus; contactId?: string }

function parseListQuery(query: ListQuery) {
  if (query.page && !/^\d+$/.test(query.page)) throw new ValidationError('page pozitif tam sayi olmalidir.');
  if (query.limit && !/^\d+$/.test(query.limit)) throw new ValidationError('limit pozitif tam sayi olmalidir.');
  if (query.type && !Object.values(CheckNoteType).includes(query.type)) throw new ValidationError('Gecersiz cek/senet tipi.');
  if (query.status && !Object.values(CheckStatus).includes(query.status)) throw new ValidationError('Gecersiz cek/senet durumu.');
  const page = Number(query.page ?? 1), pageSize = Number(query.limit ?? 20);
  if (page < 1 || pageSize < 1 || pageSize > 100) throw new ValidationError('page en az 1, limit 1-100 araliginda olmalidir.');
  return { page, pageSize };
}

async function assertContactOwnership(tenantId: string, contactId?: string | null) {
  if (!contactId) return;
  const contact = await prisma.contact.findFirst({ where: { id: contactId, tenantId, deletedAt: null }, select: { id: true } });
  if (!contact) throw new ValidationError('Cari bu tenant icinde bulunamadi.');
}

export const CheckPromissoryController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c), query = c.req.query() as ListQuery;
    const { page, pageSize } = parseListQuery(query);
    const where = { tenantId, deletedAt: null, ...(query.type && { type: query.type }), ...(query.status && { status: query.status }), ...(query.contactId && { contactId: query.contactId }) };
    const [total, notes] = await prisma.$transaction([
      prisma.checkPromissoryNote.count({ where }),
      prisma.checkPromissoryNote.findMany({ where, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return c.json({ data: notes, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = getValidatedBody<CreateCheckPromissoryBody>(c, createCheckPromissoryBodySchema);
    await assertContactOwnership(tenantId, body.contactId);
    const note = await prisma.checkPromissoryNote.create({ data: {
      tenantId, contactId: body.contactId ?? null, type: body.type, number: body.number, amount: body.amount,
      currencyCode: body.currencyCode ?? 'TRY', issueDate: new Date(`${body.issueDate}T00:00:00.000Z`),
      dueDate: new Date(`${body.dueDate}T00:00:00.000Z`), bankName: body.bankName ?? null, notes: body.notes ?? null,
    } });
    return c.json({ data: note }, 201);
  },

  async updateStatus(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c), id = requireParam(c, 'id');
    const existing = await prisma.checkPromissoryNote.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) throw new NotFoundError('Cek/Senet', id);
    const body = getValidatedBody<UpdateCheckPromissoryStatusBody>(c, updateCheckPromissoryStatusBodySchema);
    const transitions: Record<CheckStatus, CheckStatus[]> = { PENDING: [CheckStatus.DEPOSITED, CheckStatus.CANCELLED], DEPOSITED: [CheckStatus.CLEARED, CheckStatus.BOUNCED], CLEARED: [], BOUNCED: [], CANCELLED: [] };
    if (!transitions[existing.status].includes(body.status)) throw new ValidationError(`${existing.status} durumundan ${body.status} durumuna gecis yapilamaz.`);
    const changed = await prisma.checkPromissoryNote.updateMany({ where: { id, tenantId, status: existing.status, deletedAt: null }, data: { status: body.status } });
    if (changed.count !== 1) throw new ConflictError('Cek/senet durumu baska bir islem tarafindan degistirildi.');
    return c.json({ data: await prisma.checkPromissoryNote.findUniqueOrThrow({ where: { id } }) });
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c), id = requireParam(c, 'id');
    const existing = await prisma.checkPromissoryNote.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) throw new NotFoundError('Cek/Senet', id);
    if (existing.status !== CheckStatus.PENDING) throw new ValidationError('Sadece bekleyen cek/senetler duzenlenebilir.');
    const body = getValidatedBody<UpdateCheckPromissoryBody>(c, updateCheckPromissoryBodySchema);
    if (body.dueDate && body.dueDate < existing.issueDate.toISOString().slice(0, 10)) throw new ValidationError('Vade tarihi duzenleme tarihinden once olamaz.');
    await assertContactOwnership(tenantId, body.contactId);
    const changed = await prisma.checkPromissoryNote.updateMany({ where: { id, tenantId, status: CheckStatus.PENDING, deletedAt: null }, data: {
      ...(body.contactId !== undefined && { contactId: body.contactId }), ...(body.amount !== undefined && { amount: body.amount }),
      ...(body.dueDate !== undefined && { dueDate: new Date(`${body.dueDate}T00:00:00.000Z`) }),
      ...(body.bankName !== undefined && { bankName: body.bankName }), ...(body.notes !== undefined && { notes: body.notes }),
    } });
    if (changed.count !== 1) throw new ConflictError('Cek/senet baska bir islem tarafindan degistirildi.');
    return c.json({ data: await prisma.checkPromissoryNote.findUniqueOrThrow({ where: { id } }) });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c), id = requireParam(c, 'id');
    const existing = await prisma.checkPromissoryNote.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) throw new NotFoundError('Cek/Senet', id);
    if (existing.status !== CheckStatus.PENDING) throw new ValidationError('Sadece bekleyen cek/senetler silinebilir.');
    const changed = await prisma.checkPromissoryNote.updateMany({ where: { id, tenantId, status: CheckStatus.PENDING, deletedAt: null }, data: { deletedAt: new Date() } });
    if (changed.count !== 1) throw new ConflictError('Cek/senet baska bir islem tarafindan degistirildi.');
    return c.json({ data: { success: true } });
  },
};
