import { Context } from 'hono';
import { JournalEntryType, AccountType, FiscalPeriodStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { generateDocumentNumber } from '../utils/generate-number.js';
import { requireTenantId, requireUserId, requireParam } from '../utils/context.js';
import {
  assertJournalBalanced,
  resolveOpenFiscalPeriodId,
  readRequiredReason,
} from '../services/financial/index.js';
import { computeTrialBalance, assertTrialBalanceBalanced } from '../services/financial/trial-balance.js';
import { getContactStatement, verifyContactAccountBalance } from '../services/financial/account-entry-reconciliation.js';
import { getAccountingClosingChecklist } from '../services/accounting-closing-checklist.service.js';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readOptionalJsonObject(c: Context): Promise<Record<string, unknown>> {
  const rawBody = await c.req.text();
  if (!rawBody.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new ValidationError('Gecersiz JSON govdesi.');
  }
  if (!isRecord(parsed)) throw new ValidationError('Gecersiz istek govdesi.');
  return parsed;
}



// ─────────────────────────────────────────────
// Accounting Controller
// ─────────────────────────────────────────────

export const AccountingController = {
  // ── Ledger Accounts ──────────────────────────

  async listAccounts(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

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
    const tenantId = requireTenantId(c);

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
    const tenantId = requireTenantId(c);

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
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    const body = await c.req.json<CreateJournalEntryDTO>();

    if (!body.date || !body.lines?.length) {
      return c.json(
        new ValidationError('date ve en az bir satır zorunludur.').toJSON(),
        400,
      );
    }

    // Borç = Alacak dengesi kontrolü
    assertJournalBalanced(body.lines);
    const entryDate = new Date(body.date);
    const fiscalPeriodId = await resolveOpenFiscalPeriodId(prisma, tenantId, entryDate, 'Yevmiye fisi');
    const number = await generateDocumentNumber(tenantId, 'journal', 'JE-', 'journalEntry');

    const entry = await prisma.journalEntry.create({
      data: {
        tenantId,
        fiscalPeriodId,
        type: JournalEntryType.MANUAL,
        number,
        date: entryDate,
        description: body.description ?? null,
        isPosted: false,
        createdById: userId,
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
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const entryId = c.req.param('id');

    const entry = await prisma.journalEntry.findFirst({
      where: { id: entryId, tenantId },
    });
    if (!entry) {
      return c.json(new NotFoundError('Yevmiye fişi', entryId).toJSON(), 404);
    }

    if (entry.isPosted) {
      return c.json(new ValidationError('Fiş zaten onaylanmış.').toJSON(), 400);
    }

    const fiscalPeriodId = await resolveOpenFiscalPeriodId(prisma, tenantId, entry.date, 'Yevmiye fisi onayi');

    const updated = await prisma.journalEntry.update({
      where: { id: entryId },
      data: { isPosted: true, fiscalPeriodId, postedAt: new Date(), postedById: userId },
    });

    return c.json({ data: updated });
  },

  // ── Update draft journal entry ───────────────

  async updateJournalEntry(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const entryId = c.req.param('id');

    const entry = await prisma.journalEntry.findFirst({ where: { id: entryId, tenantId } });
    if (!entry) return c.json(new NotFoundError('Yevmiye fişi', entryId).toJSON(), 404);
    if (entry.isPosted) {
      return c.json(new ValidationError('Onaylı fişler düzenlenemez.').toJSON(), 400);
    }

    const body = await c.req.json<CreateJournalEntryDTO>();
    if (!body.date || !body.lines?.length) {
      return c.json(new ValidationError('date ve en az bir satir zorunludur.').toJSON(), 400);
    }

    assertJournalBalanced(body.lines);
    const entryDate = new Date(body.date);
    const fiscalPeriodId = await resolveOpenFiscalPeriodId(prisma, tenantId, entryDate, 'Yevmiye fisi duzeltmesi');

    const updatedEntry = await prisma.$transaction(async (tx) => {
      await tx.journalEntryLine.deleteMany({ where: { tenantId, journalEntryId: entryId } });
      return tx.journalEntry.update({
        where: { id: entryId },
        data: {
          date: entryDate,
          fiscalPeriodId,
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
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const entryId = c.req.param('id');
    const body = await readOptionalJsonObject(c);
    const reason = readRequiredReason(body);

    const entry = await prisma.journalEntry.findFirst({
      where: { id: entryId, tenantId },
      include: { lines: true },
    });
    if (!entry) return c.json(new NotFoundError('Yevmiye fişi', entryId).toJSON(), 404);
    if (!entry.isPosted) {
      return c.json(new ValidationError('Sadece onaylı fişler ters kayıt yapılabilir.').toJSON(), 400);
    }
    const reversalDate = new Date();
    const fiscalPeriodId = await resolveOpenFiscalPeriodId(prisma, tenantId, reversalDate, 'Yevmiye ters kaydi');
    const number = await generateDocumentNumber(tenantId, 'journal', 'JE-', 'journalEntry');

    const reversal = await prisma.journalEntry.create({
      data: {
        tenantId,
        fiscalPeriodId,
        type: JournalEntryType.MANUAL,
        number,
        date: reversalDate,
        description: `Ters kayit: ${entry.number}. Neden: ${reason}`,
        refType: 'JOURNAL_REVERSAL',
        refId: entry.id,
        isPosted: true,
        postedAt: reversalDate,
        postedById: userId,
        createdById: userId,
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
    const tenantId = requireTenantId(c);
    const accountId = c.req.param('id');

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
    const tenantId = requireTenantId(c);
    const accountId = c.req.param('id');

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
    const tenantId = requireTenantId(c);
    const entryId = c.req.param('id');

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
    const tenantId = requireTenantId(c);

    const periods = await prisma.fiscalPeriod.findMany({
      where: { tenantId },
      orderBy: { startDate: 'desc' },
    });

    return c.json({ data: periods });
  },

  async createFiscalPeriod(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

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
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const periodId = c.req.param('id');

    const period = await prisma.fiscalPeriod.findFirst({ where: { id: periodId, tenantId } });
    if (!period) return c.json(new NotFoundError('Dönem', periodId).toJSON(), 404);

    if (period.status !== FiscalPeriodStatus.OPEN) {
      return c.json(new ValidationError('Sadece açık dönemler kapatılabilir.').toJSON(), 400);
    }

    // Onaylanmamış (draft) fişleri olan dönem kapatılamaz
    const draftCount = await prisma.journalEntry.count({
      where: { tenantId, fiscalPeriodId: periodId, isPosted: false },
    });
    if (draftCount > 0) {
      return c.json(
        new ValidationError(`Bu döneme ait ${draftCount} onaylanmamış yevmiye fişi var. Önce fişleri onaylayın veya silin.`).toJSON(),
        400,
      );
    }

    const updated = await prisma.fiscalPeriod.update({
      where: { id: periodId },
      data: { status: FiscalPeriodStatus.CLOSED, closedAt: new Date(), closedById: userId },
    });

    return c.json({ data: updated });
  },

  async getFiscalPeriodClosingChecklist(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const periodId = requireParam(c, 'id');

    const checklist = await getAccountingClosingChecklist(prisma, tenantId, periodId);
    if (!checklist) return c.json(new NotFoundError('Dönem', periodId).toJSON(), 404);

    return c.json({ data: checklist });
  },

  async lockFiscalPeriod(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const periodId = c.req.param('id');

    const period = await prisma.fiscalPeriod.findFirst({ where: { id: periodId, tenantId } });
    if (!period) return c.json(new NotFoundError('Dönem', periodId).toJSON(), 404);

    if (period.status !== FiscalPeriodStatus.CLOSED) {
      return c.json(new ValidationError('Sadece kapalı dönemler kilitlenebilir.').toJSON(), 400);
    }

    const updated = await prisma.fiscalPeriod.update({
      where: { id: periodId },
      data: { status: FiscalPeriodStatus.LOCKED },
    });

    return c.json({ data: updated });
  },

  async reopenFiscalPeriod(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const periodId = c.req.param('id');

    const body = await readOptionalJsonObject(c);
    const reason = readRequiredReason(body);

    const period = await prisma.fiscalPeriod.findFirst({ where: { id: periodId, tenantId } });
    if (!period) return c.json(new NotFoundError('Dönem', periodId).toJSON(), 404);

    if (period.status === FiscalPeriodStatus.OPEN) {
      return c.json(new ValidationError('Dönem zaten açık.').toJSON(), 400);
    }

    if (period.status === FiscalPeriodStatus.LOCKED) {
      return c.json(
        new ValidationError('Kilitli dönem yeniden açılamaz. Önce kilidi kaldırın.').toJSON(),
        400,
      );
    }

    const updated = await prisma.fiscalPeriod.update({
      where: { id: periodId },
      data: { status: FiscalPeriodStatus.OPEN, closedAt: null, closedById: null },
    });

    void reason; // audit log için ileride kullanılabilir
    return c.json({ data: updated });
  },

  async deleteFiscalPeriod(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const periodId = c.req.param('id');

    const period = await prisma.fiscalPeriod.findFirst({ where: { id: periodId, tenantId } });
    if (!period) return c.json(new NotFoundError('Dönem', periodId).toJSON(), 404);

    if (period.status !== FiscalPeriodStatus.OPEN) {
      return c.json(new ValidationError('Sadece açık dönemler silinebilir.').toJSON(), 400);
    }

    const hasEntries = await prisma.journalEntry.count({ where: { tenantId, fiscalPeriodId: periodId } });
    if (hasEntries > 0) {
      return c.json(new ValidationError(`Bu döneme ait ${hasEntries} yevmiye fişi var. Önce fişleri silin.`).toJSON(), 400);
    }

    await prisma.fiscalPeriod.delete({ where: { id: periodId } });
    return c.json({ data: { success: true } });
  },

  // ── Trial Balance (Mizan) ─────────────────────

  async getTrialBalance(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const dateFromStr = c.req.query('dateFrom');
    const dateToStr = c.req.query('dateTo');

    const dateFrom = dateFromStr ? new Date(dateFromStr) : undefined;
    const dateTo = dateToStr ? new Date(dateToStr) : undefined;

    if (dateFrom && Number.isNaN(dateFrom.getTime())) {
      return c.json(new ValidationError('dateFrom geçersiz tarih.').toJSON(), 400);
    }
    if (dateTo && Number.isNaN(dateTo.getTime())) {
      return c.json(new ValidationError('dateTo geçersiz tarih.').toJSON(), 400);
    }

    const rows = await computeTrialBalance(prisma, { tenantId, dateFrom, dateTo });
    const { totalDebit, totalCredit, isBalanced } = assertTrialBalanceBalanced(rows);

    return c.json({
      data: rows,
      meta: { totalDebit, totalCredit, isBalanced, rowCount: rows.length },
    });
  },

  // ── Account Statement (Cari Ekstre) ───────────

  async getContactStatement(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const contactId = c.req.param('contactId');
    if (!contactId) return c.json(new ValidationError('contactId zorunludur.').toJSON(), 400);

    const dateFromStr = c.req.query('dateFrom');
    const dateToStr = c.req.query('dateTo');
    const limitStr = c.req.query('limit');

    const dateFrom = dateFromStr ? new Date(dateFromStr) : undefined;
    const dateTo = dateToStr ? new Date(dateToStr) : undefined;
    const limit = limitStr ? Math.min(1000, Math.max(1, parseInt(limitStr, 10))) : 100;

    const [rows, balanceSummary] = await Promise.all([
      getContactStatement(prisma, { tenantId, contactId, dateFrom, dateTo, limit }),
      verifyContactAccountBalance(prisma, tenantId, contactId),
    ]);

    return c.json({
      data: rows,
      meta: balanceSummary,
    });
  },
};
