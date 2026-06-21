import type { PrismaClient } from '@prisma/client';
import type { AccountStatementRow, ContactBalanceSummary, ContactStatementInput } from './types.js';

// ─────────────────────────────────────────────
// Account Entry Reconciliation
// Cari hesap ekstrası ve bakiye doğrulama.
// ─────────────────────────────────────────────

interface AccountEntryRow {
  id: string;
  date: Date;
  description: string | null;
  debit: { toNumber(): number };
  credit: { toNumber(): number };
  balance: { toNumber(): number };
  refType: string | null;
  refId: string | null;
}

/**
 * Bir carinin hesap hareketlerini (AccountEntry) döner.
 * Tarih sıralamasına göre sıralı, limit opsiyonel.
 */
export async function getContactStatement(
  db: PrismaClient,
  input: ContactStatementInput,
): Promise<AccountStatementRow[]> {
  const { tenantId, contactId, dateFrom, dateTo, limit } = input;

  const rows = await db.accountEntry.findMany({
    where: {
      tenantId,
      contactId,
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom && { gte: dateFrom }),
              ...(dateTo && { lte: dateTo }),
            },
          }
        : {}),
    },
    orderBy: { date: 'asc' },
    ...(limit && { take: limit }),
    select: {
      id: true,
      date: true,
      description: true,
      debit: true,
      credit: true,
      balance: true,
      refType: true,
      refId: true,
    },
  }) as AccountEntryRow[];

  return rows.map((row): AccountStatementRow => ({
    id: row.id,
    date: row.date,
    description: row.description,
    debit: row.debit.toNumber(),
    credit: row.credit.toNumber(),
    balance: row.balance.toNumber(),
    refType: row.refType,
    refId: row.refId,
  }));
}

/**
 * Carinin kayıtlı running balance'ının hesaplamadan türetilen değerle
 * tutarlı olup olmadığını kontrol eder.
 *
 * Running balance = Σ debit − Σ credit
 * Eğer son satırdaki `balance` değeri bu toplamla uyuşmuyorsa
 * `hasDiscrepancy: true` döner (muhasebe hatası uyarısı).
 */
export async function verifyContactAccountBalance(
  db: PrismaClient,
  tenantId: string,
  contactId: string,
): Promise<ContactBalanceSummary> {
  interface AggResult {
    _sum: {
      debit: { toNumber(): number } | null;
      credit: { toNumber(): number } | null;
    };
  }

  const [agg, lastEntry] = await Promise.all([
    db.accountEntry.aggregate({
      where: { tenantId, contactId },
      _sum: { debit: true, credit: true },
    }) as Promise<AggResult>,
    db.accountEntry.findFirst({
      where: { tenantId, contactId },
      orderBy: { date: 'desc' },
      select: { balance: true },
    }) as Promise<{ balance: { toNumber(): number } } | null>,
  ]);

  const totalDebit = agg._sum.debit?.toNumber() ?? 0;
  const totalCredit = agg._sum.credit?.toNumber() ?? 0;
  const calculatedBalance = totalDebit - totalCredit;
  const lastRecordedBalance = lastEntry?.balance.toNumber() ?? 0;

  return {
    contactId,
    totalDebit,
    totalCredit,
    calculatedBalance,
    lastRecordedBalance,
    hasDiscrepancy: Math.abs(calculatedBalance - lastRecordedBalance) > 0.01,
  };
}
