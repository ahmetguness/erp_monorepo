import { AuditAction, EntityType } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../../errors';
import { createAuditLog } from '../../utils/audit.js';
import { assertPayrollReversible } from './period-guard.js';

// ─────────────────────────────────────────────
// Payroll Reverse
// Ödenmiş bordroya ters kayıt uygular:
//   1. Kapalı dönem kilidi kontrol edilir
//      (YYYY-MM formatındaki period → o ayın 1. günü)
//   2. paidAt → null (ödenmemiş durumuna alınır)
//   3. reason AuditLog'a yazılır
// ─────────────────────────────────────────────

export interface ReversePayrollInput {
  tenantId: string;
  userId: string | null | undefined;
  payrollId: string;
  reason: string;
  auditMeta?: { ipAddress?: string | null; userAgent?: string | null };
}

/**
 * Bordro dönem stringini (YYYY-MM) o ayın 1. günü Date'e çevirir.
 * Dönem kilidi kontrolünde kullanılır.
 */
function payrollPeriodToDate(period: string): Date {
  const [year, month] = period.split('-').map((n) => Number.parseInt(n, 10));
  if (!year || !month || Number.isNaN(year) || Number.isNaN(month)) {
    throw new Error(`Geçersiz bordro dönemi formatı: ${period}`);
  }
  return new Date(Date.UTC(year, month - 1, 1));
}

export async function reversePayroll(db: PrismaClient, input: ReversePayrollInput): Promise<void> {
  const payroll = await db.payroll.findFirst({
    where: { id: input.payrollId, tenantId: input.tenantId },
    select: {
      id: true,
      paidAt: true,
      deletedAt: true,
      period: true,
      grossSalary: true,
      netSalary: true,
      employeeId: true,
    },
  });

  if (!payroll) throw new NotFoundError('Bordro', input.payrollId);

  // Sadece ödenmiş bordrolar ters kayıt alabilir
  assertPayrollReversible(payroll, 'Bordro ters kaydı');

  // Bordro döneminin kapalı olmadığını kontrol et
  // Not: Payroll.period = "YYYY-MM" formatında, FiscalPeriod.startDate/endDate ile eşleştirilir
  const periodDate = payrollPeriodToDate(payroll.period);

  const closedPeriod = await db.fiscalPeriod.findFirst({
    where: {
      tenantId: input.tenantId,
      startDate: { lte: periodDate },
      endDate: { gte: periodDate },
      status: { in: ['CLOSED', 'LOCKED'] },
    },
    select: { name: true, status: true },
  });

  if (closedPeriod) {
    throw new Error(
      `Bordro dönemi (${payroll.period}) kapalı mali döneme denk geliyor: ${closedPeriod.name} (${closedPeriod.status}).`,
    );
  }

  await db.payroll.update({
    where: { id: input.payrollId },
    data: {
      paidAt: null,
      notes: input.reason,
    },
  });

  await createAuditLog(db, {
    tenantId: input.tenantId,
    userId: input.userId,
    module: 'payroll',
    entityType: EntityType.OTHER,
    entityId: input.payrollId,
    action: AuditAction.UPDATE,
    oldValues: { paidAt: payroll.paidAt?.toISOString() ?? null },
    newValues: { paidAt: null, reason: input.reason },
    ipAddress: input.auditMeta?.ipAddress,
    userAgent: input.auditMeta?.userAgent,
  });
}
