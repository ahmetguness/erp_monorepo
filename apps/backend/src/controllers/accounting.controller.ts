import { Context } from 'hono';
import { JournalEntryType, AccountType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface CreateLedgerAccountDTO {
  code: string;
  name: string;
  type: AccountType;
  parentId?: string;
}

interface JournalEntryLineDTO {
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
}

interface CreateJournalEntryDTO {
  date: string;
  description?: string;
  lines: JournalEntryLineDTO[];
}

interface LedgerAccountListQuery {
  type?: AccountType;
  search?: string;
  isActive?: string;
}

interface JournalEntryListQuery {
  page?: string;
  limit?: string;
  dateFrom?: string;
  dateTo?: string;
  isPosted?: string;
}

// ─────────────────────────────────────────────
// Accounting Controller
// ─────────────────────────────────────────────

export const AccountingController = {
  // ── Ledger Accounts ──────────────────────────

  async listAccounts(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const query = c.req.query() as LedgerAccountListQuery;

    const where = {
      tenantId,
      ...(query.type && { type: query.type }),
      ...(query.isActive !== undefined && { isActive: query.isActive === 'true' }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { code: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const accounts = await prisma.ledgerAccount.findMany({
      where,
      orderBy: { code: 'asc' },
    });

    return c.json({ data: accounts });
  },

  async createAccount(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const body = await c.req.json<CreateLedgerAccountDTO>();

    if (!body.code || !body.name || !body.type) {
      return c.json(
        new ValidationError('code, name ve type alanları zorunludur.').toJSON(),
        400,
      );
    }

    const existing = await prisma.ledgerAccount.findFirst({
      where: { tenantId, code: body.code },
    });
    if (existing) {
      return c.json(
        new ValidationError(`"${body.code}" hesap kodu zaten kullanımda.`).toJSON(),
        400,
      );
    }

    const account = await prisma.ledgerAccount.create({
      data: {
        tenantId,
        code: body.code,
        name: body.name,
        accountType: body.type,
        parentId: body.parentId ?? null,
      },
    });

    return c.json({ data: account }, 201);
  },

  // ── Journal Entries ──────────────────────────

  async listJournalEntries(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const query = c.req.query() as JournalEntryListQuery;
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      ...(query.isPosted !== undefined && { isPosted: query.isPosted === 'true' }),
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
      prisma.journalEntry.count({ where }),
      prisma.journalEntry.findMany({
        where,
        include: {
          lines: {
            include: {
              account: { select: { id: true, code: true, name: true } },
            },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: entries,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async createJournalEntry(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const body = await c.req.json<CreateJournalEntryDTO>();

    if (!body.date || !body.lines?.length) {
      return c.json(
        new ValidationError('date ve en az bir satır zorunludur.').toJSON(),
        400,
      );
    }

    // Borç = Alacak dengesi kontrolü
    const totalDebit = body.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = body.lines.reduce((s, l) => s + (l.credit ?? 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      return c.json(
        new ValidationError(
          `Borç (${totalDebit}) ve alacak (${totalCredit}) toplamları eşit olmalıdır.`,
        ).toJSON(),
        400,
      );
    }

    const seq = await prisma.numberSequence.upsert({
      where: { tenantId_module: { tenantId, module: 'journal' } },
      create: { tenantId, module: 'journal', prefix: 'JE-', lastNum: 1, padding: 6 },
      update: { lastNum: { increment: 1 } },
    });
    const number = `${seq.prefix}${String(seq.lastNum).padStart(seq.padding, '0')}`;

    const entry = await prisma.journalEntry.create({
      data: {
        tenantId,
        type: JournalEntryType.MANUAL,
        number,
        date: new Date(body.date),
        description: body.description ?? null,
        isPosted: false,
        lines: {
          create: body.lines.map((l) => ({
            tenantId,
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            description: l.description ?? null,
          })),
        },
      },
      include: {
        lines: {
          include: {
            account: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    return c.json({ data: entry }, 201);
  },

  async postJournalEntry(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const entryId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const entry = await prisma.journalEntry.findFirst({
      where: { id: entryId, tenantId },
    });
    if (!entry) {
      return c.json(new NotFoundError('Yevmiye fişi', entryId).toJSON(), 404);
    }

    if (entry.isPosted) {
      return c.json(new ValidationError('Fiş zaten onaylanmış.').toJSON(), 400);
    }

    const updated = await prisma.journalEntry.update({
      where: { id: entryId },
      data: { isPosted: true },
    });

    return c.json({ data: updated });
  },

  // ── Update draft journal entry ───────────────

  async updateJournalEntry(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const entryId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const entry = await prisma.journalEntry.findFirst({ where: { id: entryId, tenantId } });
    if (!entry) return c.json(new NotFoundError('Yevmiye fişi', entryId).toJSON(), 404);
    if (entry.isPosted) {
      return c.json(new ValidationError('Onaylı fişler düzenlenemez.').toJSON(), 400);
    }

    const body = await c.req.json<CreateJournalEntryDTO>();

    const totalDebit = body.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = body.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      return c.json(new ValidationError('Borç ve alacak toplamları eşit olmalıdır.').toJSON(), 400);
    }

    const updatedEntry = await prisma.$transaction(async (tx) => {
      await tx.journalEntryLine.deleteMany({ where: { journalEntryId: entryId } });
      return tx.journalEntry.update({
        where: { id: entryId },
        data: {
          date: new Date(body.date),
          description: body.description ?? null,
          lines: {
            create: body.lines.map((l) => ({
              tenantId,
              accountId: l.accountId,
              debit: l.debit,
              credit: l.credit,
              description: l.description ?? null,
            })),
          },
        },
        include: { lines: { include: { account: { select: { id: true, code: true, name: true } } } } },
      });
    });

    return c.json({ data: updatedEntry });
  },

  // ── Reverse (storno) posted journal entry ────

  async reverseJournalEntry(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const entryId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const entry = await prisma.journalEntry.findFirst({
      where: { id: entryId, tenantId },
      include: { lines: true },
    });
    if (!entry) return c.json(new NotFoundError('Yevmiye fişi', entryId).toJSON(), 404);
    if (!entry.isPosted) {
      return c.json(new ValidationError('Sadece onaylı fişler ters kayıt yapılabilir.').toJSON(), 400);
    }

    const seq = await prisma.numberSequence.upsert({
      where: { tenantId_module: { tenantId, module: 'journal' } },
      create: { tenantId, module: 'journal', prefix: 'JE-', lastNum: 1, padding: 6 },
      update: { lastNum: { increment: 1 } },
    });
    const number = `${seq.prefix}${String(seq.lastNum).padStart(seq.padding, '0')}`;

    const reversal = await prisma.journalEntry.create({
      data: {
        tenantId,
        type: JournalEntryType.MANUAL,
        number,
        date: new Date(),
        description: `Ters kayıt: ${entry.number}`,
        isPosted: true,
        lines: {
          create: entry.lines.map((l) => ({
            tenantId,
            accountId: l.accountId,
            debit: l.credit,
            credit: l.debit,
            description: `Storno: ${l.description ?? ''}`.trim(),
          })),
        },
      },
      include: { lines: { include: { account: { select: { id: true, code: true, name: true } } } } },
    });

    return c.json({ data: reversal }, 201);
  },
};

// ─────────────────────────────────────────────
// Accounting Extended Controller
// LedgerAccount update/delete, JournalEntry getById, FiscalPeriod
// ─────────────────────────────────────────────

interface UpdateLedgerAccountDTO {
  name?: string;
  isActive?: boolean;
}

interface CreateFiscalPeriodDTO {
  name: string;
  startDate: string;
  endDate: string;
}

export const AccountingExtController = {
  // ── LedgerAccount ────────────────────────────

  async getAccountById(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const accountId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const account = await prisma.ledgerAccount.findFirst({
      where: { id: accountId, tenantId, deletedAt: null },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: { select: { id: true, code: true, name: true } },
      },
    });

    if (!account) return c.json(new NotFoundError('Hesap', accountId).toJSON(), 404);
    return c.json({ data: account });
  },

  async updateAccount(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const accountId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const account = await prisma.ledgerAccount.findFirst({
      where: { id: accountId, tenantId, deletedAt: null },
    });
    if (!account) return c.json(new NotFoundError('Hesap', accountId).toJSON(), 404);

    const body = await c.req.json<UpdateLedgerAccountDTO>();

    const updated = await prisma.ledgerAccount.update({
      where: { id: accountId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return c.json({ data: updated });
  },

  // ── JournalEntry ─────────────────────────────

  async getJournalEntryById(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const entryId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const entry = await prisma.journalEntry.findFirst({
      where: { id: entryId, tenantId },
      include: {
        lines: {
          include: { account: { select: { id: true, code: true, name: true } } },
          orderBy: { sortOrder: 'asc' },
        },
        fiscalPeriod: { select: { id: true, name: true, status: true } },
      },
    });

    if (!entry) return c.json(new NotFoundError('Yevmiye fişi', entryId).toJSON(), 404);
    return c.json({ data: entry });
  },

  // ── FiscalPeriod ─────────────────────────────

  async listFiscalPeriods(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const periods = await prisma.fiscalPeriod.findMany({
      where: { tenantId },
      orderBy: { startDate: 'desc' },
    });

    return c.json({ data: periods });
  },

  async createFiscalPeriod(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const body = await c.req.json<CreateFiscalPeriodDTO>();

    if (!body.name || !body.startDate || !body.endDate) {
      return c.json(new ValidationError('name, startDate ve endDate zorunludur.').toJSON(), 400);
    }

    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);

    if (startDate >= endDate) {
      return c.json(new ValidationError('Başlangıç tarihi bitiş tarihinden önce olmalıdır.').toJSON(), 400);
    }

    // Çakışma kontrolü — aynı tarih aralığında başka dönem olmamalı
    const overlap = await prisma.fiscalPeriod.findFirst({
      where: {
        tenantId,
        OR: [
          { startDate: { lte: endDate }, endDate: { gte: startDate } },
        ],
      },
    });
    if (overlap) {
      return c.json(
        new ValidationError(`Bu tarih aralığı "${overlap.name}" dönemi ile çakışıyor.`).toJSON(),
        400,
      );
    }

    const period = await prisma.fiscalPeriod.create({
      data: { tenantId, name: body.name, startDate, endDate },
    });

    return c.json({ data: period }, 201);
  },

  async closeFiscalPeriod(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const periodId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const period = await prisma.fiscalPeriod.findFirst({ where: { id: periodId, tenantId } });
    if (!period) return c.json(new NotFoundError('Dönem', periodId).toJSON(), 404);

    if (period.status !== 'OPEN') {
      return c.json(new ValidationError('Sadece açık dönemler kapatılabilir.').toJSON(), 400);
    }

    const updated = await prisma.fiscalPeriod.update({
      where: { id: periodId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    return c.json({ data: updated });
  },
};
