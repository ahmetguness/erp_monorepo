import { createHash } from "node:crypto";
import {
  AuditAction,
  BankTransactionRefType,
  BankTransactionType,
  EntityType,
  FiscalPeriodStatus,
  JournalEntryType,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { ValidationError } from "../../../../errors/index.js";
import { generateDocumentNumber } from "../../../../utils/generate-number.js";
import { createAuditLog } from "../../../../utils/audit.js";
import type {
  OpeningBalanceCommitResult,
  OpeningBalanceInput,
  OpeningBalanceIssue,
  OpeningBalancePreview,
} from "../../application/opening-balances/opening-balance.types.js";

const MODULE = "opening_balances";
const cents = (value: number): number => Math.round(value * 100);
const total = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0);

function importId(input: OpeningBalanceInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function validSide(debit: number, credit: number): boolean {
  return (debit > 0 && credit === 0) || (credit > 0 && debit === 0);
}

export class OpeningBalanceService {
  constructor(private readonly db: PrismaClient) {}

  async preview(
    tenantId: string,
    input: OpeningBalanceInput,
  ): Promise<OpeningBalancePreview> {
    const id = importId(input);
    const date = new Date(`${input.openingDate}T00:00:00.000Z`);
    const [priorPeriod, contacts, banks, accounts, replay] = await Promise.all([
      this.db.fiscalPeriod.findFirst({
        where: {
          tenantId,
          endDate: { lt: date },
        },
        orderBy: { endDate: "desc" },
        select: { id: true, name: true, endDate: true, status: true },
      }),
      this.db.contact.findMany({
        where: {
          tenantId,
          deletedAt: null,
          code: { in: input.contacts.map((row) => row.contactCode) },
        },
        select: {
          id: true,
          code: true,
          _count: { select: { accountEntries: true } },
        },
      }),
      this.db.bankAccount.findMany({
        where: {
          tenantId,
          deletedAt: null,
          id: { in: input.banks.map((row) => row.bankAccountId) },
        },
        select: { id: true, _count: { select: { transactions: true } } },
      }),
      this.db.ledgerAccount.findMany({
        where: {
          tenantId,
          deletedAt: null,
          code: { in: input.ledger.map((row) => row.accountCode) },
        },
        select: { id: true, code: true },
      }),
      this.db.moduleSetting.findUnique({
        where: {
          tenantId_module_key: { tenantId, module: MODULE, key: `run:${id}` },
        },
        select: { id: true },
      }),
    ]);
    const issues: OpeningBalanceIssue[] = [];
    const priorPeriodClosed =
      priorPeriod?.status === FiscalPeriodStatus.CLOSED ||
      priorPeriod?.status === FiscalPeriodStatus.LOCKED;
    if (!priorPeriodClosed)
      issues.push({
        scope: "period",
        row: null,
        message:
          "Acilis tarihinden onceki en son mali donem CLOSED veya LOCKED olmalidir.",
      });
    const contactsByCode = new Map(
      contacts.map((row) => [row.code ?? "", row]),
    );
    const seenContacts = new Set<string>();
    input.contacts.forEach((row, index) => {
      const contact = contactsByCode.get(row.contactCode);
      if (!contact)
        issues.push({
          scope: "contacts",
          row: index + 1,
          message: `${row.contactCode} cari kodu bulunamadi.`,
        });
      else if (contact._count.accountEntries > 0)
        issues.push({
          scope: "contacts",
          row: index + 1,
          message: `${row.contactCode} icin daha once cari hareket olusmus.`,
        });
      if (!validSide(row.debit, row.credit))
        issues.push({
          scope: "contacts",
          row: index + 1,
          message:
            "Borc veya alacak alanlarindan yalnizca biri sifirdan buyuk olmalidir.",
        });
      if (seenContacts.has(row.contactCode))
        issues.push({ scope: "contacts", row: index + 1, message: `${row.contactCode} cari kodu pakette tekrar ediyor.` });
      seenContacts.add(row.contactCode);
    });
    const banksById = new Map(banks.map((row) => [row.id, row]));
    const seenBanks = new Set<string>();
    input.banks.forEach((row, index) => {
      const bank = banksById.get(row.bankAccountId);
      if (!bank)
        issues.push({
          scope: "banks",
          row: index + 1,
          message: "Banka hesabi bulunamadi.",
        });
      else if (bank._count.transactions > 0)
        issues.push({
          scope: "banks",
          row: index + 1,
          message: "Banka hesabinda daha once hareket olusmus.",
        });
      if (row.balance === 0)
        issues.push({ scope: "banks", row: index + 1, message: "Sifir bakiyeli banka acilis satiri olusturulamaz." });
      if (seenBanks.has(row.bankAccountId))
        issues.push({ scope: "banks", row: index + 1, message: "Banka hesabi pakette tekrar ediyor." });
      seenBanks.add(row.bankAccountId);
    });
    const accountCodes = new Set(accounts.map((row) => row.code));
    input.ledger.forEach((row, index) => {
      if (!accountCodes.has(row.accountCode))
        issues.push({
          scope: "ledger",
          row: index + 1,
          message: `${row.accountCode} muhasebe hesabi bulunamadi.`,
        });
      if (!validSide(row.debit, row.credit))
        issues.push({
          scope: "ledger",
          row: index + 1,
          message:
            "Borc veya alacak alanlarindan yalnizca biri sifirdan buyuk olmalidir.",
        });
    });
    const totals = {
      contactDebit: total(input.contacts.map((row) => row.debit)),
      contactCredit: total(input.contacts.map((row) => row.credit)),
      bankBalance: total(input.banks.map((row) => row.balance)),
      ledgerDebit: total(input.ledger.map((row) => row.debit)),
      ledgerCredit: total(input.ledger.map((row) => row.credit)),
    };
    if (cents(totals.ledgerDebit) !== cents(totals.ledgerCredit))
      issues.push({
        scope: "ledger",
        row: null,
        message: "Acilis fisi borc ve alacak toplamlari esit olmalidir.",
      });
    return {
      importId: id,
      openingDate: input.openingDate,
      valid: issues.length === 0,
      replayed: Boolean(replay),
      issues,
      totals,
      closedPriorPeriod: priorPeriodClosed && priorPeriod
        ? { id: priorPeriod.id, name: priorPeriod.name, endDate: priorPeriod.endDate.toISOString() }
        : null,
    };
  }

  async commit(
    tenantId: string,
    userId: string,
    input: OpeningBalanceInput,
    meta: { ipAddress: string | null; userAgent: string | null },
  ): Promise<OpeningBalanceCommitResult> {
    const preview = await this.preview(tenantId, input);
    if (preview.replayed)
      throw new ValidationError(
        "Bu acilis bakiyesi paketi daha once kesinlestirildi.",
      );
    if (!preview.valid)
      throw new ValidationError(
        preview.issues[0]?.message ?? "Acilis bakiyeleri gecersiz.",
      );
    const date = new Date(`${input.openingDate}T00:00:00.000Z`);
    return this.db.$transaction(
      async (tx) => {
        const [contacts, banks, accounts, latestPriorPeriod, existingRun] = await Promise.all([
          tx.contact.findMany({
            where: {
              tenantId,
              deletedAt: null,
              code: { in: input.contacts.map((row) => row.contactCode) },
            },
            select: { id: true, code: true },
          }),
          tx.bankAccount.findMany({
            where: { tenantId, deletedAt: null, id: { in: input.banks.map((row) => row.bankAccountId) } },
            select: { id: true },
          }),
          tx.ledgerAccount.findMany({
            where: {
              tenantId,
              deletedAt: null,
              code: { in: input.ledger.map((row) => row.accountCode) },
            },
            select: { id: true, code: true },
          }),
          tx.fiscalPeriod.findFirst({
            where: { tenantId, endDate: { lt: date } },
            orderBy: { endDate: "desc" },
            select: { status: true },
          }),
          tx.moduleSetting.findUnique({
            where: { tenantId_module_key: { tenantId, module: MODULE, key: `run:${preview.importId}` } },
            select: { id: true },
          }),
        ]);
        if (existingRun)
          throw new ValidationError("Bu acilis bakiyesi paketi daha once kesinlestirildi.");
        if (latestPriorPeriod?.status !== FiscalPeriodStatus.CLOSED && latestPriorPeriod?.status !== FiscalPeriodStatus.LOCKED)
          throw new ValidationError("Acilis tarihinden onceki en son mali donem kapali degil.");
        const ledgerCodeCount = new Set(input.ledger.map((row) => row.accountCode)).size;
        if (contacts.length !== input.contacts.length || banks.length !== input.banks.length || accounts.length !== ledgerCodeCount)
          throw new ValidationError("Acilis paketi referanslarindan biri artik mevcut degil.");
        const [contactMovementCount, bankMovementCount] = await Promise.all([
          tx.accountEntry.count({ where: { tenantId, contactId: { in: contacts.map((row) => row.id) } } }),
          tx.bankTransaction.count({ where: { tenantId, bankAccountId: { in: banks.map((row) => row.id) } } }),
        ]);
        if (contactMovementCount > 0 || bankMovementCount > 0)
          throw new ValidationError("Kesinlestirme sirasinda cari veya banka hareketi olustu; islem geri alindi.");
        const contactsByCode = new Map(
          contacts.map((row) => [row.code ?? "", row.id]),
        );
        const accountsByCode = new Map(
          accounts.map((row) => [row.code, row.id]),
        );
        for (const row of input.contacts) {
          const contactId = contactsByCode.get(row.contactCode);
          if (!contactId)
            throw new ValidationError(
              `${row.contactCode} cari kodu artik mevcut degil.`,
            );
          await tx.accountEntry.create({
            data: {
              tenantId,
              contactId,
              date,
              debit: row.debit,
              credit: row.credit,
              balance: row.debit - row.credit,
              description: row.description ?? "Acilis bakiyesi",
              refType: "OPENING_BALANCE",
              refId: preview.importId,
              createdById: userId,
            },
          });
        }
        for (const row of input.banks) {
          await tx.bankTransaction.create({
            data: {
              tenantId,
              bankAccountId: row.bankAccountId,
              type:
                row.balance >= 0
                  ? BankTransactionType.DEPOSIT
                  : BankTransactionType.WITHDRAWAL,
              amount: Math.abs(row.balance),
              balanceAfter: row.balance,
              date,
              description: row.description ?? "Acilis bakiyesi",
              reference: input.reference,
              refType: BankTransactionRefType.OTHER,
              refId: preview.importId,
              createdById: userId,
            },
          });
        }
        const number = await generateDocumentNumber(
          tenantId,
          "opening_balance",
          "AC-",
          "journalEntry",
          tx,
        );
        const journal = await tx.journalEntry.create({
          data: {
            tenantId,
            fiscalPeriodId: null,
            type: JournalEntryType.OPENING,
            number,
            date,
            description: `Acilis bakiyesi - ${input.reference}`,
            refType: "OPENING_BALANCE",
            refId: preview.importId,
            isPosted: true,
            postedAt: new Date(),
            postedById: userId,
            createdById: userId,
            idempotencyKey: preview.importId,
            lines: {
              create: input.ledger.map((row, index) => ({
                tenantId,
                accountId: accountsByCode.get(row.accountCode) ?? "",
                debit: row.debit,
                credit: row.credit,
                description: row.description ?? null,
                sortOrder: index,
              })),
            },
          },
        });
        await tx.moduleSetting.create({
          data: {
            tenantId,
            module: MODULE,
            key: `run:${preview.importId}`,
            value: JSON.stringify({
              openingDate: input.openingDate,
              reference: input.reference,
              journalEntryId: journal.id,
              completedAt: new Date().toISOString(),
            }),
          },
        });
        await createAuditLog(tx, {
          tenantId,
          userId,
          module: "accounting",
          entityType: EntityType.OTHER,
          entityId: preview.importId,
          action: AuditAction.CREATE,
          newValues: {
            reference: input.reference,
            contacts: input.contacts.length,
            banks: input.banks.length,
            ledgerLines: input.ledger.length,
            journalEntryId: journal.id,
          },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
        return {
          ...preview,
          accountEntriesCreated: input.contacts.length,
          bankTransactionsCreated: input.banks.length,
          journalEntryId: journal.id,
          journalEntryNumber: journal.number,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
