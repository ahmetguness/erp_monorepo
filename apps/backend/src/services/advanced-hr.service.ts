import { EntityType, Priority, TaskStatus } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

type AdvancedHrDbClient = PrismaClient;

const OPEN_TASK_STATUSES: readonly TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
];

interface ExpenseAdvanceConfig {
  type: HrExpenseAdvanceType;
  taskPrefix: string;
  documentTag: string;
}

export interface AdvancedHrInput {
  tenantId: string;
}

export interface AdvancedHrEmployeeRef {
  id: string;
  fullName: string;
  department: string | null;
  position: string | null;
}

export type HrReviewStatus = 'ready' | 'scheduled' | 'missing';
export type HrTrainingStatus = 'complete' | 'planned' | 'missing';
export type HrAssetStatus = 'assigned' | 'missing';
export type HrExpenseAdvanceStatus = 'pending' | 'documented' | 'missing';
export type HrExpenseAdvanceType = 'expense' | 'advance';
export type HrPriority = 'low' | 'medium' | 'high' | 'critical';

export interface PerformanceReviewRow {
  employee: AdvancedHrEmployeeRef;
  status: HrReviewStatus;
  openActionCount: number;
  lastReviewAt: string | null;
  nextReviewAt: string;
}

export interface TrainingMatrixRow {
  employee: AdvancedHrEmployeeRef;
  status: HrTrainingStatus;
  completedCount: number;
  plannedCount: number;
  missingTopics: string[];
}

export interface HrAssetAssignmentRow {
  employee: AdvancedHrEmployeeRef;
  status: HrAssetStatus;
  assetCount: number;
  documentCount: number;
  lastAssignedAt: string | null;
}

export interface HrExpenseAdvanceRow {
  employee: AdvancedHrEmployeeRef;
  type: HrExpenseAdvanceType;
  status: HrExpenseAdvanceStatus;
  openActionCount: number;
  documentCount: number;
  nextDueAt: string | null;
  lastDocumentAt: string | null;
}

export interface OrganizationNode {
  id: string;
  parentId: string | null;
  label: string;
  type: 'department' | 'position' | 'employee';
  employeeCount: number;
}

export interface AdvancedHrSummary {
  employeeCount: number;
  departmentCount: number;
  reviewMissingCount: number;
  trainingMissingCount: number;
  assetMissingCount: number;
  expenseAdvancePendingCount: number;
  organizationNodeCount: number;
}

export interface AdvancedHrResult {
  summary: AdvancedHrSummary;
  performanceReviews: PerformanceReviewRow[];
  trainingMatrix: TrainingMatrixRow[];
  assetAssignments: HrAssetAssignmentRow[];
  expenseAdvances: HrExpenseAdvanceRow[];
  organization: OrganizationNode[];
}

interface EmployeeLookup {
  id: string;
  firstName: string;
  lastName: string;
  department: string | null;
  position: string | null;
  hireDate: Date;
}

interface TaskLookup {
  id: string;
  priority: Priority;
  status: TaskStatus;
  entityId: string | null;
  source: string | null;
  dueAt: Date | null;
  createdAt: Date;
}

interface AttachmentLookup {
  entityId: string;
  tags: string[];
  createdAt: Date;
}

function fullName(employee: EmployeeLookup): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

function employeeRef(employee: EmployeeLookup): AdvancedHrEmployeeRef {
  return {
    id: employee.id,
    fullName: fullName(employee),
    department: employee.department,
    position: employee.position,
  };
}

function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function latestDate(dates: readonly Date[]): Date | null {
  return [...dates].sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

function isSource(task: TaskLookup, prefix: string): boolean {
  return task.source?.startsWith(prefix) ?? false;
}

function departmentKey(value: string | null): string {
  return value?.trim() || 'Departman Yok';
}

function positionKey(value: string | null): string {
  return value?.trim() || 'Pozisyon Yok';
}

function hasTag(attachment: AttachmentLookup, tag: string): boolean {
  return attachment.tags.includes(tag);
}

function unique<T>(items: readonly T[]): T[] {
  return Array.from(new Set(items));
}

function earliestDate(dates: readonly Date[]): Date | null {
  return [...dates].sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
}

function expenseAdvanceStatus(openActionCount: number, documentCount: number): HrExpenseAdvanceStatus {
  if (openActionCount > 0) return 'pending';
  if (documentCount > 0) return 'documented';
  return 'missing';
}

export async function getAdvancedHr(
  db: AdvancedHrDbClient,
  input: AdvancedHrInput,
): Promise<AdvancedHrResult> {
  const [employees, tasks, attachments] = await Promise.all([
    db.employee.findMany({
      where: { tenantId: input.tenantId, deletedAt: null, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        department: true,
        position: true,
        hireDate: true,
      },
      orderBy: [{ department: 'asc' }, { firstName: 'asc' }, { lastName: 'asc' }],
      take: 300,
    }),
    db.task.findMany({
      where: {
        tenantId: input.tenantId,
        module: 'hr',
        status: { in: [...OPEN_TASK_STATUSES] },
        entityType: EntityType.EMPLOYEE,
      },
      select: {
        id: true,
        priority: true,
        status: true,
        entityId: true,
        source: true,
        dueAt: true,
        createdAt: true,
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 500,
    }),
    db.attachment.findMany({
      where: {
        tenantId: input.tenantId,
        entityType: EntityType.EMPLOYEE,
      },
      select: {
        entityId: true,
        tags: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
  ]);

  const tasksByEmployee = new Map<string, TaskLookup[]>();
  for (const task of tasks) {
    if (!task.entityId) continue;
    const current = tasksByEmployee.get(task.entityId) ?? [];
    current.push(task);
    tasksByEmployee.set(task.entityId, current);
  }

  const attachmentsByEmployee = new Map<string, AttachmentLookup[]>();
  for (const attachment of attachments) {
    const current = attachmentsByEmployee.get(attachment.entityId) ?? [];
    current.push(attachment);
    attachmentsByEmployee.set(attachment.entityId, current);
  }

  const performanceReviews = employees.map((employee): PerformanceReviewRow => {
    const employeeTasks = tasksByEmployee.get(employee.id) ?? [];
    const reviewTasks = employeeTasks.filter((task) => isSource(task, 'hr:performance'));
    const lastReviewAt = latestDate(
      (attachmentsByEmployee.get(employee.id) ?? [])
        .filter((attachment) => hasTag(attachment, 'performance-review'))
        .map((attachment) => attachment.createdAt),
    );
    const nextReviewAt = addDays(lastReviewAt ?? employee.hireDate, 180);
    return {
      employee: employeeRef(employee),
      status: reviewTasks.length > 0 ? 'scheduled' : lastReviewAt ? 'ready' : 'missing',
      openActionCount: reviewTasks.length,
      lastReviewAt: lastReviewAt?.toISOString() ?? null,
      nextReviewAt: nextReviewAt.toISOString(),
    };
  });

  const trainingMatrix = employees.map((employee): TrainingMatrixRow => {
    const employeeTasks = tasksByEmployee.get(employee.id) ?? [];
    const trainingTasks = employeeTasks.filter((task) => isSource(task, 'hr:training'));
    const employeeAttachments = attachmentsByEmployee.get(employee.id) ?? [];
    const completedTopics = employeeAttachments
      .filter((attachment) => hasTag(attachment, 'training-certificate'))
      .length;
    const missingTopics = [
      ...(employee.position ? [] : ['Pozisyon bazli egitim seti']),
      ...(completedTopics > 0 ? [] : ['Temel oryantasyon']),
      ...(trainingTasks.length > 0 ? [] : ['Guncel egitim plani']),
    ];
    return {
      employee: employeeRef(employee),
      status: missingTopics.length === 0 ? 'complete' : trainingTasks.length > 0 ? 'planned' : 'missing',
      completedCount: completedTopics,
      plannedCount: trainingTasks.length,
      missingTopics,
    };
  });

  const assetAssignments = employees.map((employee): HrAssetAssignmentRow => {
    const employeeAttachments = attachmentsByEmployee.get(employee.id) ?? [];
    const assetDocs = employeeAttachments.filter((attachment) => hasTag(attachment, 'asset-assignment'));
    const lastAssignedAt = latestDate(assetDocs.map((attachment) => attachment.createdAt));
    return {
      employee: employeeRef(employee),
      status: assetDocs.length > 0 ? 'assigned' : 'missing',
      assetCount: assetDocs.length,
      documentCount: assetDocs.length,
      lastAssignedAt: lastAssignedAt?.toISOString() ?? null,
    };
  });

  const expenseAdvances = employees.flatMap((employee): HrExpenseAdvanceRow[] => {
    const employeeTasks = tasksByEmployee.get(employee.id) ?? [];
    const employeeAttachments = attachmentsByEmployee.get(employee.id) ?? [];
    const configs: readonly ExpenseAdvanceConfig[] = [
      {
        type: 'expense',
        taskPrefix: 'hr:expense',
        documentTag: 'expense-receipt',
      },
      {
        type: 'advance',
        taskPrefix: 'hr:advance',
        documentTag: 'advance-form',
      },
    ];
    return configs.map((config): HrExpenseAdvanceRow => {
      const flowTasks = employeeTasks.filter((task) => isSource(task, config.taskPrefix));
      const flowDocs = employeeAttachments.filter((attachment) => hasTag(attachment, config.documentTag));
      return {
        employee: employeeRef(employee),
        type: config.type,
        status: expenseAdvanceStatus(flowTasks.length, flowDocs.length),
        openActionCount: flowTasks.length,
        documentCount: flowDocs.length,
        nextDueAt: earliestDate(flowTasks.map((task) => task.dueAt).filter((date): date is Date => date !== null))?.toISOString() ?? null,
        lastDocumentAt: latestDate(flowDocs.map((attachment) => attachment.createdAt))?.toISOString() ?? null,
      };
    });
  }).filter((row) => row.status !== 'missing').slice(0, 80);

  const organization: OrganizationNode[] = [];
  const departmentNames = unique(employees.map((employee) => departmentKey(employee.department)));
  for (const department of departmentNames) {
    const departmentEmployees = employees.filter((employee) => departmentKey(employee.department) === department);
    const departmentId = `department:${department}`;
    organization.push({
      id: departmentId,
      parentId: null,
      label: department,
      type: 'department',
      employeeCount: departmentEmployees.length,
    });

    const positions = unique(departmentEmployees.map((employee) => positionKey(employee.position)));
    for (const position of positions) {
      const positionEmployees = departmentEmployees.filter((employee) => positionKey(employee.position) === position);
      const positionId = `${departmentId}:position:${position}`;
      organization.push({
        id: positionId,
        parentId: departmentId,
        label: position,
        type: 'position',
        employeeCount: positionEmployees.length,
      });
      for (const employee of positionEmployees) {
        organization.push({
          id: `employee:${employee.id}`,
          parentId: positionId,
          label: fullName(employee),
          type: 'employee',
          employeeCount: 1,
        });
      }
    }
  }

  return {
    summary: {
      employeeCount: employees.length,
      departmentCount: departmentNames.length,
      reviewMissingCount: performanceReviews.filter((row) => row.status === 'missing').length,
      trainingMissingCount: trainingMatrix.filter((row) => row.status === 'missing').length,
      assetMissingCount: assetAssignments.filter((row) => row.status === 'missing').length,
      expenseAdvancePendingCount: expenseAdvances.filter((row) => row.status === 'pending').length,
      organizationNodeCount: organization.length,
    },
    performanceReviews,
    trainingMatrix,
    assetAssignments,
    expenseAdvances,
    organization,
  };
}
