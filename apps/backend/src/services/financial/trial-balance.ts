import type { PrismaClient } from '@prisma/client';
import type { TrialBalanceInput, TrialBalanceRow } from './types.js';

// ─────────────────────────────────────────────
// Trial Balance (Mizan)
// Onaylanmış (isPosted=true) yevmiye fişleri bazlı
// hesap planı borç/alacak özeti.
// ─────────────────────────────────────────────

interface JournalLineSumRaw {
  accountId: string;
  _sum: {
    debit: { toNumber(): number } | null;
    credit: { toNumber(): number } | null;
  };
}

interface LedgerAccountRow {
  id: string;
  code: string;
  name: string;
  accountType: string;
}

/**
 * Onaylanmış yevmiye fişlerinden mizan hesaplar.
 * Sıfır bakiyeli hesaplar da dahil edilir.
 * Sonuç account kodu sıralamasına göre döner.
 */
export async function computeTrialBalance(
  db: PrismaClient,
  input: TrialBalanceInput,
): Promise<TrialBalanceRow[]> {
  const { tenantId, dateFrom, dateTo } = input;

  // Sadece onaylanmış fişleri al, tarih filtresi opsiyonel
  const journalWhere = {
    tenantId,
    isPosted: true,
    ...(dateFrom || dateTo
      ? {
          date: {
            ...(dateFrom && { gte: dateFrom }),
            ...(dateTo && { lte: dateTo }),
          },
        }
      : {}),
  };

  const lineSumsRaw = await db.journalEntryLine.groupBy({
    by: ['accountId'],
    where: {
      tenantId,
      journalEntry: journalWhere,
    },
    _sum: { debit: true, credit: true },
  });

  const accounts: LedgerAccountRow[] = await db.ledgerAccount.findMany({
    where: { tenantId, isActive: true, deletedAt: null },
    select: { id: true, code: true, name: true, accountType: true },
    orderBy: { code: 'asc' },
  });

  const lineSums: JournalLineSumRaw[] = lineSumsRaw.map((row) => ({
    accountId: row.accountId,
    _sum: {
      debit: row._sum.debit,
      credit: row._sum.credit,
    },
  }));

  // accountId → sum map
  const sumMap = new Map(
    lineSums.map((row) => [
      row.accountId,
      {
        debit: row._sum.debit?.toNumber() ?? 0,
        credit: row._sum.credit?.toNumber() ?? 0,
      },
    ]),
  );

  // Her aktif hesap için satır oluştur (bakiyesi sıfır olanlar dahil)
  return accounts.map((account): TrialBalanceRow => {
    const sums = sumMap.get(account.id) ?? { debit: 0, credit: 0 };
    return {
      accountId: account.id,
      code: account.code,
      name: account.name,
      accountType: account.accountType,
      debit: sums.debit,
      credit: sums.credit,
      balance: sums.debit - sums.credit,
    };
  });
}

/**
 * Mizanın toplam borç/alacak denkliğini doğrular.
 * Onaylı fişlerde teorik olarak her zaman eşit olmalıdır.
 */
export function assertTrialBalanceBalanced(rows: readonly TrialBalanceRow[]): {
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
} {
  const totalDebit = rows.reduce((sum, row) => sum + row.debit, 0);
  const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0);
  return {
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) <= 0.01,
  };
}
