import { AccountType,FiscalPeriodStatus,JournalEntryType } from '@prisma/client';
import { Context } from 'hono';
import { ConflictError,NotFoundError,ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { getAccountingClosingChecklist } from '../../../../services/accounting-closing-checklist.service.js';
import { AccountingPostingEngineService,parsePostingEngineOptions } from '../../../../services/accounting-posting-engine.service.js';
import { getContactStatement,verifyContactAccountBalance } from '../../../../services/financial/account-entry-reconciliation.js';
import {
assertJournalBalanced,
readRequiredReason,
resolveOpenFiscalPeriodId,
} from '../../../../services/financial/index.js';
import { assertTrialBalanceBalanced,computeTrialBalance } from '../../../../services/financial/trial-balance.js';
import { requireParam,requireTenantId,requireUserId } from '../../../../utils/context.js';
import { generateDocumentNumber } from '../../../../utils/generate-number.js';

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

const MAX_JOURNAL_LINES = 1000;
const MAX_JOURNAL_AMOUNT = 9_999_999_999_999_999;

function parseJournalEntryBody(body: Record<string, unknown>): CreateJournalEntryDTO {
  if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    throw new ValidationError('date YYYY-MM-DD formatında zorunludur.');
  }
  const date = new Date(body.date);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== body.date) {
    throw new ValidationError('date geçerli bir tarih olmalıdır.');
  }
  if (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 500)) {
    throw new ValidationError('description en fazla 500 karakter olabilir.');
  }
  if (!Array.isArray(body.lines) || body.lines.length < 2 || body.lines.length > MAX_JOURNAL_LINES) {
    throw new ValidationError(`lines 2-${MAX_JOURNAL_LINES} satır içermelidir.`);
  }
  const lines = body.lines.map((value, index) => {
    if (!isRecord(value) || typeof value.accountId !== 'string' || !value.accountId.trim()) {
      throw new ValidationError(`lines.${index}.accountId zorunludur.`);
    }
    const debit = value.debit;
    const credit = value.credit;
    if (typeof debit !== 'number' || !Number.isFinite(debit) || debit < 0 || debit > MAX_JOURNAL_AMOUNT) {
      throw new ValidationError(`lines.${index}.debit geçersizdir.`);
    }
    if (typeof credit !== 'number' || !Number.isFinite(credit) || credit < 0 || credit > MAX_JOURNAL_AMOUNT) {
      throw new ValidationError(`lines.${index}.credit geçersizdir.`);
    }
    if (Math.abs(debit * 100 - Math.round(debit * 100)) > 1e-7 || Math.abs(credit * 100 - Math.round(credit * 100)) > 1e-7) {
      throw new ValidationError(`lines.${index} tutarları en fazla iki ondalık basamak içerebilir.`);
    }
    if ((debit > 0) === (credit > 0)) {
      throw new ValidationError(`lines.${index} yalnızca borç veya alacak içermelidir.`);
    }
    if (value.description !== undefined && typeof value.description !== 'string') {
      throw new ValidationError(`lines.${index}.description metin olmalıdır.`);
    }
    return {
      accountId: value.accountId.trim(),
      debit,
      credit,
      ...(typeof value.description === 'string' && { description: value.description.trim() }),
    };
  });
  assertJournalBalanced(lines);
  return {
    date: body.date,
    ...(typeof body.description === 'string' && { description: body.description.trim() }),
    lines,
  };
}

async function assertJournalAccountsOwned(tenantId: string, lines: readonly JournalEntryLineDTO[]): Promise<void> {
  const accountIds = [...new Set(lines.map((line) => line.accountId))];
  const ownedCount = await prisma.ledgerAccount.count({
    where: { tenantId, id: { in: accountIds }, deletedAt: null, isActive: true },
  });
  if (ownedCount !== accountIds.length) {
    throw new ValidationError('Fiş satırlarındaki hesaplardan biri bu tenant içinde aktif değil.');
  }
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

const ACCOUNT_TYPES = new Set<string>(Object.values(AccountType));
const ACCOUNT_CODE_MAX_LENGTH = 50;
const ACCOUNT_NAME_MAX_LENGTH = 200;

function requiredTrimmedString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${field} alanı zorunludur.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new ValidationError(`${field} en fazla ${maxLength} karakter olabilir.`);
  return normalized;
}

function parseAccountType(value: unknown): AccountType {
  if (typeof value !== 'string' || !ACCOUNT_TYPES.has(value)) {
    throw new ValidationError('Geçerli bir hesap tipi zorunludur.');
  }
  return value as AccountType;
}



// ─────────────────────────────────────────────
// Accounting Controller
// ─────────────────────────────────────────────

export const AccountingController = {
  // ── Ledger Accounts ──────────────────────────

  async listAccounts(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as LedgerAccountListQuery;

    if (query.type !== undefined && !ACCOUNT_TYPES.has(query.type)) {
      return c.json(new ValidationError('Geçersiz hesap tipi filtresi.').toJSON(), 400);
    }
    if (query.isActive !== undefined && query.isActive !== 'true' && query.isActive !== 'false') {
      return c.json(new ValidationError('isActive true veya false olmalıdır.').toJSON(), 400);
    }

    const where = {
      tenantId,
      deletedAt: null,
      ...(query.type && { accountType: query.type }),
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
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: {
          where: { deletedAt: null },
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: { code: 'asc' },
    });

    return c.json({ data: accounts });
  },

  async createAccount(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await readOptionalJsonObject(c);

    const code = requiredTrimmedString(body.code, 'code', ACCOUNT_CODE_MAX_LENGTH);
    const name = requiredTrimmedString(body.name, 'name', ACCOUNT_NAME_MAX_LENGTH);
    const accountType = parseAccountType(body.type);
    const parentId = body.parentId === undefined || body.parentId === null || body.parentId === ''
      ? null
      : requiredTrimmedString(body.parentId, 'parentId', 191);

    if (parentId) {
      const parent = await prisma.ledgerAccount.findFirst({
        where: { id: parentId, tenantId, deletedAt: null },
        select: { accountType: true, isActive: true },
      });
      if (!parent) throw new ValidationError('Üst hesap bu tenant içinde bulunamadı.');
      if (!parent.isActive) throw new ValidationError('Pasif bir hesap üst hesap olarak seçilemez.');
      if (parent.accountType !== accountType) throw new ValidationError('Üst hesap ile alt hesap aynı hesap tipinde olmalıdır.');
    }

    const existing = await prisma.ledgerAccount.findFirst({
      where: { tenantId, code },
    });
    if (existing) {
      return c.json(
        new ValidationError(`"${code}" hesap kodu zaten kullanımda.`).toJSON(),
        409,
      );
    }

    const account = await prisma.ledgerAccount.create({
      data: {
        tenantId,
        code,
        name,
        accountType,
        parentId,
      },
    });

    return c.json({ data: account }, 201);
  },

  // ── Journal Entries ──────────────────────────

  async runPostingEngine(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = c.get('userId') as string | undefined;
    const body = await readOptionalJsonObject(c);
    const options = parsePostingEngineOptions(body, userId);
    const result = await new AccountingPostingEngineService(prisma).run(tenantId, options);
    return c.json({ data: result });
  },

  async listJournalEntries(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as JournalEntryListQuery;
    const page = Number(query.page ?? '1');
    const pageSize = Number(query.limit ?? '20');
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return c.json(new ValidationError('page ve limit geçerli aralıkta tam sayı olmalıdır.').toJSON(), 400);
    }
    if (query.isPosted !== undefined && query.isPosted !== 'true' && query.isPosted !== 'false') {
      return c.json(new ValidationError('isPosted true veya false olmalıdır.').toJSON(), 400);
    }
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;
    if ((dateFrom && Number.isNaN(dateFrom.getTime())) || (dateTo && Number.isNaN(dateTo.getTime()))) {
      return c.json(new ValidationError('Tarih filtresi geçersizdir.').toJSON(), 400);
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return c.json(new ValidationError('dateFrom, dateTo sonrasinda olamaz.').toJSON(), 400);
    }
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      ...(query.isPosted !== undefined && { isPosted: query.isPosted === 'true' }),
      ...(query.dateFrom || query.dateTo
        ? {
            date: {
              ...(dateFrom && { gte: dateFrom }),
              ...(dateTo && { lte: dateTo }),
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

    const body = parseJournalEntryBody(await readOptionalJsonObject(c));
    await assertJournalAccountsOwned(tenantId, body.lines);
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

    const result = await prisma.journalEntry.updateMany({
      where: { id: entryId, tenantId, isPosted: false },
      data: { isPosted: true, fiscalPeriodId, postedAt: new Date(), postedById: userId },
    });
    if (result.count !== 1) throw new ConflictError('Fiş başka bir işlem tarafından zaten onaylandı.');
    const updated = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entryId } });

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

    const body = parseJournalEntryBody(await readOptionalJsonObject(c));
    await assertJournalAccountsOwned(tenantId, body.lines);
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
    const existingReversal = await prisma.journalEntry.findFirst({
      where: { tenantId, refType: 'JOURNAL_REVERSAL', refId: entry.id },
      select: { id: true },
    });
    if (existingReversal) throw new ConflictError('Bu fiş için ters kayıt zaten oluşturuldu.');
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

const FISCAL_PERIOD_NAME_MAX_LENGTH = 200;

function parseFiscalPeriodBody(body: Record<string, unknown>): CreateFiscalPeriodDTO {
  const name = requiredTrimmedString(body.name, 'name', FISCAL_PERIOD_NAME_MAX_LENGTH);
  const parseDate = (value: unknown, field: string): string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new ValidationError(`${field} YYYY-MM-DD formatında zorunludur.`);
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new ValidationError(`${field} geçerli bir tarih olmalıdır.`);
    }
    return value;
  };
  const startDate = parseDate(body.startDate, 'startDate');
  const endDate = parseDate(body.endDate, 'endDate');
  if (startDate >= endDate) {
    throw new ValidationError('Başlangıç tarihi bitiş tarihinden önce olmalıdır.');
  }
  return { name, startDate, endDate };
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

    const body = await readOptionalJsonObject(c);
    const allowedFields = new Set(['name', 'isActive']);
    if (Object.keys(body).some((key) => !allowedFields.has(key))) {
      return c.json(new ValidationError('Yalnızca name ve isActive alanları güncellenebilir.').toJSON(), 400);
    }
    if (body.name === undefined && body.isActive === undefined) {
      return c.json(new ValidationError('Güncellenecek en az bir alan zorunludur.').toJSON(), 400);
    }
    const name = body.name === undefined
      ? undefined
      : requiredTrimmedString(body.name, 'name', ACCOUNT_NAME_MAX_LENGTH);
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
      return c.json(new ValidationError('isActive boolean olmalıdır.').toJSON(), 400);
    }

    const updated = await prisma.ledgerAccount.update({
      where: { id: accountId },
      data: {
        ...(name !== undefined && { name }),
        ...(body.isActive !== undefined && { isActive: body.isActive as boolean }),
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
    const body = parseFiscalPeriodBody(await readOptionalJsonObject(c));
    const startDate = new Date(`${body.startDate}T00:00:00.000Z`);
    const endDate = new Date(`${body.endDate}T00:00:00.000Z`);

    const period = await prisma.$transaction(async (tx) => {
      // Serialize creates per tenant for a deterministic conflict response.
      // The DB exclusion constraint remains the final concurrency invariant.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
      const overlap = await tx.fiscalPeriod.findFirst({
        where: { tenantId, startDate: { lte: endDate }, endDate: { gte: startDate } },
      });
      if (overlap) {
        throw new ConflictError(`Bu tarih aralığı "${overlap.name}" dönemi ile çakışıyor.`);
      }
      return tx.fiscalPeriod.create({ data: { tenantId, name: body.name, startDate, endDate } });
    });

    return c.json({ data: period }, 201);
  },

  async closeFiscalPeriod(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const periodId = requireParam(c, 'id');

    const period = await prisma.fiscalPeriod.findFirst({ where: { id: periodId, tenantId } });
    if (!period) return c.json(new NotFoundError('Dönem', periodId).toJSON(), 404);

    if (period.status !== FiscalPeriodStatus.OPEN) {
      return c.json(new ValidationError('Sadece açık dönemler kapatılabilir.').toJSON(), 400);
    }

    const checklist = await getAccountingClosingChecklist(prisma, tenantId, periodId);
    if (!checklist?.summary.canClose) {
      throw new ValidationError(`Dönem kapanış kontrol listesinde ${checklist?.summary.blockers ?? 0} engel var.`);
    }

    const result = await prisma.fiscalPeriod.updateMany({
      where: { id: periodId, tenantId, status: FiscalPeriodStatus.OPEN },
      data: { status: FiscalPeriodStatus.CLOSED, closedAt: new Date(), closedById: userId },
    });
    if (result.count !== 1) throw new ConflictError('Dönem başka bir işlem tarafından zaten kapatıldı.');
    const updated = await prisma.fiscalPeriod.findUniqueOrThrow({ where: { id: periodId } });

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

    const result = await prisma.fiscalPeriod.updateMany({
      where: { id: periodId, tenantId, status: FiscalPeriodStatus.CLOSED },
      data: { status: FiscalPeriodStatus.LOCKED },
    });
    if (result.count !== 1) throw new ConflictError('Dönem durumu başka bir işlem tarafından değiştirildi.');
    const updated = await prisma.fiscalPeriod.findUniqueOrThrow({ where: { id: periodId } });

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

    const result = await prisma.fiscalPeriod.updateMany({
      where: { id: periodId, tenantId, status: FiscalPeriodStatus.CLOSED },
      data: { status: FiscalPeriodStatus.OPEN, closedAt: null, closedById: null },
    });
    if (result.count !== 1) throw new ConflictError('Dönem durumu başka bir işlem tarafından değiştirildi.');
    const updated = await prisma.fiscalPeriod.findUniqueOrThrow({ where: { id: periodId } });

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
