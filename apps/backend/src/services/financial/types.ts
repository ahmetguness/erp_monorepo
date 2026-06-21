import { FiscalPeriodStatus, Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

// ─────────────────────────────────────────────
// Financial Integrity — Ortak Tip Tanımları
// ─────────────────────────────────────────────

/** Herhangi bir finansal DB müşterisi (transaction veya normal). */
export type FinancialDbClient = PrismaClient | Prisma.TransactionClient;

// ── Reverse / Cancel ─────────────────────────

/** Ters kayıt / iptal için zorunlu girdi. */
export interface FinancialReverseInput {
  tenantId: string;
  userId: string | null | undefined;
  /** reason: insan okunabilir açıklama. Boş geçilemez. */
  reason: string;
}

// ── Trial Balance ─────────────────────────────

/** Mizan satırı — bir hesabın belirli tarih aralığındaki toplamları. */
export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  accountType: string;
  debit: number;
  credit: number;
  balance: number;
}

/** computeTrialBalance girdi parametreleri. */
export interface TrialBalanceInput {
  tenantId: string;
  dateFrom?: Date;
  dateTo?: Date;
}

// ── Account Entry / Cari ─────────────────────

/** Bir carinin ekstresi için satır yapısı. */
export interface AccountStatementRow {
  id: string;
  date: Date;
  description: string | null;
  debit: number;
  credit: number;
  balance: number;
  refType: string | null;
  refId: string | null;
}

/** getContactStatement girdi parametreleri. */
export interface ContactStatementInput {
  tenantId: string;
  contactId: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}

/** Cari bakiye kontrol sonucu. */
export interface ContactBalanceSummary {
  contactId: string;
  totalDebit: number;
  totalCredit: number;
  calculatedBalance: number;
  /** Kayıtlı son bakiye değeri. Sapma varsa uyarı üretilir. */
  lastRecordedBalance: number;
  hasDiscrepancy: boolean;
}

// ── Fiscal Period ─────────────────────────────

/** Dönem kilit/açma sonucu. */
export interface PeriodLockResult {
  periodId: string;
  name: string;
  status: FiscalPeriodStatus;
}
