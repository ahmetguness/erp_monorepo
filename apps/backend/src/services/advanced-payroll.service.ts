import { ApprovalModule, ApprovalStatus, AuditAction, EntityType, PermissionAction } from '@prisma/client';
import type { Prisma, PrismaClient } from '@prisma/client';
import { runPeriodClosingChecks, type ClosingCheckItem } from './financial/payroll-integration.service.js';
import { parseApprovalFlowConditions } from './approval-conditions.service.js';

type AdvancedPayrollDbClient = PrismaClient;

export interface AdvancedPayrollInput {
  tenantId: string;
  period: string;
  userId?: string | null;
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
  sensitiveAccessIssueCount: number;
  approvalPendingCount: number;
  accountingIssueCount: number;
}

export interface PayrollAccountingIntegration {
  status: 'created' | 'missing';
  integrationStatus: 'posted' | 'draft' | 'missing' | 'unbalanced';
  journalEntryId: string | null;
  journalEntryNumber: string | null;
  postedAt: string | null;
  journalEntryHref: string | null;
  lineCount: number;
  isPosted: boolean;
  isBalanced: boolean;
  balanceDifference: number;
  totalGross: number;
  totalNet: number;
  totalDeductions: number;
}

export interface PayrollSensitiveAccessInsight {
  status: 'strict' | 'needs_export_permission' | 'needs_approval_permission';
  currentUser: {
    isOwner: boolean;
    canRead: boolean;
    canUpdate: boolean;
    canApprove: boolean;
    canExport: boolean;
  };
  roleCoverage: {
    readRoleCount: number;
    updateRoleCount: number;
    approveRoleCount: number;
    exportRoleCount: number;
  };
  warnings: string[];
}

export interface PayrollApprovalRequestRow {
  requestId: string;
  entityId: string;
  flowName: string;
  status: ApprovalStatus;
  currentStep: number;
  createdAt: string;
  resolvedAt: string | null;
  notes: string | null;
}

export interface PayrollApprovalWorkflowInsight {
  status: 'configured' | 'missing_flow' | 'pending' | 'rejected';
  activeFlowCount: number;
  approverStepCount: number;
  pendingRequestCount: number;
  approvedRequestCount: number;
  rejectedRequestCount: number;
  latestRequests: PayrollApprovalRequestRow[];
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
  sensitiveAccess: PayrollSensitiveAccessInsight;
  approvalWorkflow: PayrollApprovalWorkflowInsight;
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

type PayrollApprovalFlowLookup = {
  id: string;
  name: string;
  conditions: Prisma.JsonValue | null;
  steps: Array<{ id: string }>;
};

function isPayrollApprovalFlow(flow: PayrollApprovalFlowLookup): boolean {
  const normalizedName = flow.name.toLocaleLowerCase('tr-TR');
  if (normalizedName.includes('payroll') || normalizedName.includes('bordro')) return true;

  const documentTypes = parseApprovalFlowConditions(flow.conditions).documentTypes.map((item) =>
    item.toLocaleLowerCase('tr-TR'),
  );
  return documentTypes.some((item) => item === 'payroll' || item === 'bordro' || item === 'payroll_period');
}

function buildAccountingIntegration(
  journalEntry: {
    id: string;
    number: string;
    postedAt: Date | null;
    isPosted: boolean;
    lines: Array<{ debit: Prisma.Decimal; credit: Prisma.Decimal }>;
  } | null,
  totals: { totalGross: number; totalNet: number; totalDeductions: number },
): PayrollAccountingIntegration {
  const debitTotal = journalEntry?.lines.reduce((sum, line) => sum + decimalToNumber(line.debit), 0) ?? 0;
  const creditTotal = journalEntry?.lines.reduce((sum, line) => sum + decimalToNumber(line.credit), 0) ?? 0;
  const balanceDifference = Number((debitTotal - creditTotal).toFixed(2));
  const isBalanced = journalEntry ? Math.abs(balanceDifference) <= 0.01 : false;
  const integrationStatus: PayrollAccountingIntegration['integrationStatus'] = !journalEntry
    ? 'missing'
    : !isBalanced
      ? 'unbalanced'
      : journalEntry.isPosted
        ? 'posted'
        : 'draft';

  return {
    status: journalEntry ? 'created' : 'missing',
    integrationStatus,
    journalEntryId: journalEntry?.id ?? null,
    journalEntryNumber: journalEntry?.number ?? null,
    postedAt: journalEntry?.postedAt?.toISOString() ?? null,
    journalEntryHref: journalEntry ? `/dashboard/accounting/journal-entries/${journalEntry.id}` : null,
    lineCount: journalEntry?.lines.length ?? 0,
    isPosted: journalEntry?.isPosted ?? false,
    isBalanced,
    balanceDifference,
    ...totals,
  };
}

async function buildSensitiveAccessInsight(
  db: AdvancedPayrollDbClient,
  tenantId: string,
  userId: string | null | undefined,
): Promise<PayrollSensitiveAccessInsight> {
  const [roleCoverageRows, tenantUser] = await Promise.all([
    db.rolePermission.groupBy({
      by: ['action'],
      where: {
        module: 'payroll',
        action: { in: [PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.APPROVE, PermissionAction.EXPORT] },
        role: { tenantId },
      },
      _count: { roleId: true },
    }),
    userId
      ? db.tenantUser.findFirst({
          where: { tenantId, userId, isActive: true },
          select: {
            isOwner: true,
            roleRef: { select: { permissions: { where: { module: 'payroll' }, select: { action: true } } } },
          },
        })
      : Promise.resolve(null),
  ]);

  const coverage = new Map(roleCoverageRows.map((row) => [row.action, row._count.roleId]));
  const userActions = new Set(tenantUser?.roleRef?.permissions.map((permission) => permission.action) ?? []);
  const isOwner = tenantUser?.isOwner ?? false;
  const canRead = isOwner || userActions.has(PermissionAction.READ);
  const canUpdate = isOwner || userActions.has(PermissionAction.UPDATE);
  const canApprove = isOwner || userActions.has(PermissionAction.APPROVE);
  const canExport = isOwner || userActions.has(PermissionAction.EXPORT);
  const warnings: string[] = [];

  if ((coverage.get(PermissionAction.EXPORT) ?? 0) === 0) {
    warnings.push('Banka odeme dosyasi icin payroll:EXPORT yetkisi olan rol yok.');
  }
  if ((coverage.get(PermissionAction.APPROVE) ?? 0) === 0) {
    warnings.push('Bordro onayi icin payroll:APPROVE yetkisi olan rol yok.');
  }

  return {
    status: warnings.some((warning) => warning.includes('EXPORT'))
      ? 'needs_export_permission'
      : warnings.length > 0
        ? 'needs_approval_permission'
        : 'strict',
    currentUser: { isOwner, canRead, canUpdate, canApprove, canExport },
    roleCoverage: {
      readRoleCount: coverage.get(PermissionAction.READ) ?? 0,
      updateRoleCount: coverage.get(PermissionAction.UPDATE) ?? 0,
      approveRoleCount: coverage.get(PermissionAction.APPROVE) ?? 0,
      exportRoleCount: coverage.get(PermissionAction.EXPORT) ?? 0,
    },
    warnings,
  };
}

function buildApprovalWorkflowInsight(
  flows: PayrollApprovalFlowLookup[],
  requests: Array<{
    id: string;
    entityId: string;
    status: ApprovalStatus;
    currentStep: number;
    createdAt: Date;
    resolvedAt: Date | null;
    notes: string | null;
    flow: { name: string };
  }>,
): PayrollApprovalWorkflowInsight {
  const payrollFlows = flows.filter(isPayrollApprovalFlow);
  const pendingRequestCount = requests.filter((request) => request.status === ApprovalStatus.PENDING).length;
  const approvedRequestCount = requests.filter((request) => request.status === ApprovalStatus.APPROVED).length;
  const rejectedRequestCount = requests.filter((request) => request.status === ApprovalStatus.REJECTED).length;
  const status: PayrollApprovalWorkflowInsight['status'] = payrollFlows.length === 0
    ? 'missing_flow'
    : pendingRequestCount > 0
      ? 'pending'
      : rejectedRequestCount > 0
        ? 'rejected'
        : 'configured';

  return {
    status,
    activeFlowCount: payrollFlows.length,
    approverStepCount: payrollFlows.reduce((sum, flow) => sum + flow.steps.length, 0),
    pendingRequestCount,
    approvedRequestCount,
    rejectedRequestCount,
    latestRequests: requests.slice(0, 6).map((request) => ({
      requestId: request.id,
      entityId: request.entityId,
      flowName: request.flow.name,
      status: request.status,
      currentStep: request.currentStep,
      createdAt: request.createdAt.toISOString(),
      resolvedAt: request.resolvedAt?.toISOString() ?? null,
      notes: request.notes,
    })),
  };
}

export async function getAdvancedPayroll(
  db: AdvancedPayrollDbClient,
  input: AdvancedPayrollInput,
): Promise<AdvancedPayrollResult> {
  const { tenantId, period } = input;

  const [payrolls, activeEmployeeCount, journalEntry, closingResult, sensitiveAccess, approvalFlows] = await Promise.all([
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
      select: {
        id: true,
        number: true,
        postedAt: true,
        isPosted: true,
        lines: { select: { debit: true, credit: true }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    runPeriodClosingChecks(db, tenantId, period),
    buildSensitiveAccessInsight(db, tenantId, input.userId),
    db.approvalFlow.findMany({
      where: { tenantId, module: ApprovalModule.OTHER, isActive: true },
      select: { id: true, name: true, conditions: true, steps: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const payrollIds = payrolls.map((payroll) => payroll.id);
  const approvalEntityIds = [period, ...payrollIds];
  const payrollApprovalFlowIds = approvalFlows.filter(isPayrollApprovalFlow).map((flow) => flow.id);
  const [auditLogs, approvalRequests] = await Promise.all([
    payrollIds.length === 0
      ? Promise.resolve([])
      : db.auditLog.findMany({
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
        }),
    approvalEntityIds.length === 0 || payrollApprovalFlowIds.length === 0
      ? Promise.resolve([])
      : db.approvalRequest.findMany({
          where: {
            tenantId,
            flowId: { in: payrollApprovalFlowIds },
            entityType: EntityType.OTHER,
            entityId: { in: approvalEntityIds },
          },
          select: {
            id: true,
            entityId: true,
            status: true,
            currentStep: true,
            createdAt: true,
            resolvedAt: true,
            notes: true,
            flow: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
  ]);

  const payrollById = new Map(payrolls.map((payroll) => [payroll.id, payroll]));
  const totalGross = payrolls.reduce((sum, payroll) => sum + decimalToNumber(payroll.grossSalary), 0);
  const totalNet = payrolls.reduce((sum, payroll) => sum + decimalToNumber(payroll.netSalary), 0);
  const totalDeductions = payrolls.reduce((sum, payroll) => sum + decimalToNumber(payroll.deductions), 0);
  const paidPayrolls = payrolls.filter((payroll) => payroll.paidAt);
  const accountingVoucherCreated = Boolean(journalEntry);
  const accounting = buildAccountingIntegration(journalEntry, { totalGross, totalNet, totalDeductions });
  const approvalWorkflow = buildApprovalWorkflowInsight(approvalFlows, approvalRequests);

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
      sensitiveAccessIssueCount: sensitiveAccess.warnings.length,
      approvalPendingCount: approvalWorkflow.pendingRequestCount,
      accountingIssueCount: accounting.integrationStatus === 'posted' ? 0 : 1,
    },
    closingChecks: closingResult.checks,
    accounting,
    sensitiveAccess,
    approvalWorkflow,
    retroCorrections,
    archive,
  };
}
