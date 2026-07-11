import { AuditAction, EntityType } from '@prisma/client';
import type { Prisma, PrismaClient } from '@prisma/client';
import { runPeriodClosingChecks, type ClosingCheckItem } from './financial/payroll-integration.service.js';

type AdvancedPayrollDbClient = PrismaClient;

export interface AdvancedPayrollInput {
  tenantId: string;
  period: string;
}

export interface AdvancedPayrollSummary {
  period: string;
  payrollCount: number;
  activeEmployeeCount: number;
  missingPayrollCount: number;
  paidCount: number;
  unpaidCount: number;
  totalGross: number;
  totalNet: number;
  totalDeductions: number;
  accountingVoucherCreated: boolean;
  closingReady: boolean;
  retroCorrectionCount: number;
  archiveReadyCount: number;
}

export interface PayrollAccountingIntegration {
  status: 'created' | 'missing';
  journalEntryId: string | null;
  journalEntryNumber: string | null;
  postedAt: string | null;
  totalGross: number;
  totalNet: number;
  totalDeductions: number;
}

export interface PayrollRetroCorrectionRow {
  payrollId: string;
  employeeName: string;
  period: string;
  reason: string | null;
  correctedAt: string;
}

export interface PayrollArchiveRow {
  payrollId: string;
  employeeName: string;
  period: string;
  paidAt: string;
  netSalary: number;
  archiveStatus: 'approved_archive' | 'accounting_missing';
}

export interface AdvancedPayrollResult {
  generatedAt: string;
  summary: AdvancedPayrollSummary;
  closingChecks: ClosingCheckItem[];
  accounting: PayrollAccountingIntegration;
  retroCorrections: PayrollRetroCorrectionRow[];
  archive: PayrollArchiveRow[];
}

interface PayrollLookup {
  id: string;
  period: string;
  grossSalary: Prisma.Decimal;
  deductions: Prisma.Decimal;
  netSalary: Prisma.Decimal;
  paidAt: Date | null;
  employee: {
    firstName: string;
    lastName: string;
  };
}

function decimalToNumber(value: Prisma.Decimal): number {
  return Number(value);
}

function fullName(payroll: PayrollLookup): string {
  return `${payroll.employee.firstName} ${payroll.employee.lastName}`.trim();
}

function readJsonString(value: Prisma.JsonValue | null, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, Prisma.JsonValue>;
  const item = record[key];
  return typeof item === 'string' && item.trim() ? item : null;
}

export async function getAdvancedPayroll(
  db: AdvancedPayrollDbClient,
  input: AdvancedPayrollInput,
): Promise<AdvancedPayrollResult> {
  const { tenantId, period } = input;

  const [payrolls, activeEmployeeCount, journalEntry, closingResult] = await Promise.all([
    db.payroll.findMany({
      where: { tenantId, period, deletedAt: null },
      select: {
        id: true,
        period: true,
        grossSalary: true,
        deductions: true,
        netSalary: true,
        paidAt: true,
        employee: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ paidAt: 'asc' }, { employee: { lastName: 'asc' } }],
      take: 500,
    }),
    db.employee.count({ where: { tenantId, isActive: true, deletedAt: null } }),
    db.journalEntry.findFirst({
      where: { tenantId, refType: 'payroll', refId: period },
      select: { id: true, number: true, postedAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    runPeriodClosingChecks(db, tenantId, period),
  ]);

  const payrollIds = payrolls.map((payroll) => payroll.id);
  const auditLogs = payrollIds.length === 0
    ? []
    : await db.auditLog.findMany({
        where: {
          tenantId,
          module: 'payroll',
          entityType: EntityType.OTHER,
          action: AuditAction.UPDATE,
          entityId: { in: payrollIds },
        },
        select: {
          entityId: true,
          newValues: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

  const payrollById = new Map(payrolls.map((payroll) => [payroll.id, payroll]));
  const totalGross = payrolls.reduce((sum, payroll) => sum + decimalToNumber(payroll.grossSalary), 0);
  const totalNet = payrolls.reduce((sum, payroll) => sum + decimalToNumber(payroll.netSalary), 0);
  const totalDeductions = payrolls.reduce((sum, payroll) => sum + decimalToNumber(payroll.deductions), 0);
  const paidPayrolls = payrolls.filter((payroll) => payroll.paidAt);
  const accountingVoucherCreated = Boolean(journalEntry);

  const retroCorrections = auditLogs
    .map((log): PayrollRetroCorrectionRow | null => {
      const payroll = payrollById.get(log.entityId);
      const reason = readJsonString(log.newValues, 'reason');
      if (!payroll || !reason) return null;
      return {
        payrollId: payroll.id,
        employeeName: fullName(payroll),
        period: payroll.period,
        reason,
        correctedAt: log.createdAt.toISOString(),
      };
    })
    .filter((row): row is PayrollRetroCorrectionRow => row !== null);

  const archive = paidPayrolls.slice(0, 40).map((payroll): PayrollArchiveRow => ({
    payrollId: payroll.id,
    employeeName: fullName(payroll),
    period: payroll.period,
    paidAt: payroll.paidAt?.toISOString() ?? new Date(0).toISOString(),
    netSalary: decimalToNumber(payroll.netSalary),
    archiveStatus: accountingVoucherCreated ? 'approved_archive' : 'accounting_missing',
  }));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      period,
      payrollCount: payrolls.length,
      activeEmployeeCount,
      missingPayrollCount: Math.max(activeEmployeeCount - payrolls.length, 0),
      paidCount: paidPayrolls.length,
      unpaidCount: payrolls.length - paidPayrolls.length,
      totalGross,
      totalNet,
      totalDeductions,
      accountingVoucherCreated,
      closingReady: closingResult.success,
      retroCorrectionCount: retroCorrections.length,
      archiveReadyCount: archive.filter((row) => row.archiveStatus === 'approved_archive').length,
    },
    closingChecks: closingResult.checks,
    accounting: {
      status: accountingVoucherCreated ? 'created' : 'missing',
      journalEntryId: journalEntry?.id ?? null,
      journalEntryNumber: journalEntry?.number ?? null,
      postedAt: journalEntry?.postedAt?.toISOString() ?? null,
      totalGross,
      totalNet,
      totalDeductions,
    },
    retroCorrections,
    archive,
  };
}
