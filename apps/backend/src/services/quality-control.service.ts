import { EntityType, Priority, TaskStatus, WorkOrderStatus } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

type QualityControlDbClient = PrismaClient;

const ACTIVE_WORK_ORDER_STATUSES: readonly WorkOrderStatus[] = [
  WorkOrderStatus.PLANNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.PAUSED,
  WorkOrderStatus.COMPLETED,
];

const OPEN_QUALITY_WORK_ORDER_STATUSES: readonly WorkOrderStatus[] = [
  WorkOrderStatus.PLANNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.PAUSED,
];

const OPEN_TASK_STATUSES: readonly TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
];

export interface QualityControlInput {
  tenantId: string;
  horizonDays: number;
}

export interface QualityEntityRef {
  id: string;
  code: string;
  name: string;
}

export type QualityFormType = 'INPUT' | 'OUTPUT';
export type QualityFormStatus = 'ready' | 'needs_review' | 'blocked';
export type QualityIssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type QualityIssueType = 'scrap' | 'under_production' | 'material_shortage' | 'paused_order';

export interface QualityChecklistItem {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface QualityFormRow {
  id: string;
  type: QualityFormType;
  status: QualityFormStatus;
  workOrderId: string;
  workOrderNumber: string;
  product: QualityEntityRef;
  plannedQty: number;
  producedQty: number;
  completionPct: number;
  checklist: QualityChecklistItem[];
}

export interface QualityNonconformityRow {
  id: string;
  type: QualityIssueType;
  severity: QualityIssueSeverity;
  workOrderId: string;
  workOrderNumber: string;
  product: QualityEntityRef;
  title: string;
  detail: string;
  quantityImpact: number;
  detectedAt: string;
}

export interface QualityCorrectiveActionRow {
  id: string;
  source: 'task' | 'suggested';
  status: 'open' | 'in_progress' | 'done' | 'suggested';
  priority: 'low' | 'medium' | 'high' | 'critical';
  workOrderId: string;
  workOrderNumber: string;
  title: string;
  detail: string | null;
  dueAt: string | null;
}

export interface QualityControlSummary {
  horizonDays: number;
  inputFormCount: number;
  outputFormCount: number;
  blockedFormCount: number;
  nonconformityCount: number;
  criticalIssueCount: number;
  correctiveActionCount: number;
}

export interface QualityControlResult {
  summary: QualityControlSummary;
  inputForms: QualityFormRow[];
  outputForms: QualityFormRow[];
  nonconformities: QualityNonconformityRow[];
  correctiveActions: QualityCorrectiveActionRow[];
}

interface QualityWorkOrderLookup {
  id: string;
  number: string;
  status: WorkOrderStatus;
  plannedQty: unknown;
  producedQty: unknown;
  scrapQty: unknown;
  scrapReason: string | null;
  startDate: Date | null;
  endDate: Date | null;
  updatedAt: Date;
  product: QualityEntityRef;
  items: Array<{
    id: string;
    requiredQty: unknown;
    consumedQty: unknown;
    product: QualityEntityRef;
  }>;
  operations: Array<{
    id: string;
    status: WorkOrderStatus;
    actualStartAt: Date | null;
    actualEndAt: Date | null;
  }>;
}

interface QualityTaskLookup {
  id: string;
  title: string;
  detail: string | null;
  status: TaskStatus;
  priority: Priority;
  entityId: string | null;
  dueAt: Date | null;
}

function decimalToNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function entityRef(value: QualityEntityRef): QualityEntityRef {
  return { id: value.id, code: value.code, name: value.name };
}

function getPlanningWindow(horizonDays: number): { start: Date; end: Date } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + horizonDays - 1);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

function completionPct(producedQty: number, plannedQty: number): number {
  if (plannedQty <= 0) return producedQty > 0 ? 100 : 0;
  return roundPct(Math.min(100, (producedQty / plannedQty) * 100));
}

function materialCoverage(workOrder: QualityWorkOrderLookup): { requiredQty: number; consumedQty: number; pct: number } {
  const requiredQty = workOrder.items.reduce((sum, item) => sum + decimalToNumber(item.requiredQty), 0);
  const consumedQty = workOrder.items.reduce((sum, item) => sum + decimalToNumber(item.consumedQty), 0);
  return {
    requiredQty: roundQty(requiredQty),
    consumedQty: roundQty(consumedQty),
    pct: requiredQty > 0 ? roundPct(Math.min(100, (consumedQty / requiredQty) * 100)) : 100,
  };
}

function operationCoverage(workOrder: QualityWorkOrderLookup): { total: number; completed: number; pct: number } {
  const total = workOrder.operations.length;
  const completed = workOrder.operations.filter((operation) => operation.status === WorkOrderStatus.COMPLETED).length;
  return { total, completed, pct: total > 0 ? roundPct((completed / total) * 100) : 100 };
}

function formStatus(items: readonly QualityChecklistItem[]): QualityFormStatus {
  const failed = items.filter((item) => !item.passed).length;
  if (failed === 0) return 'ready';
  if (failed >= 2) return 'blocked';
  return 'needs_review';
}

function buildInputForm(workOrder: QualityWorkOrderLookup): QualityFormRow {
  const material = materialCoverage(workOrder);
  const plannedQty = decimalToNumber(workOrder.plannedQty);
  const producedQty = decimalToNumber(workOrder.producedQty);
  const checklist: QualityChecklistItem[] = [
    {
      key: 'material_consumption',
      label: 'Girdi malzeme kontrolu',
      passed: material.pct >= 95,
      detail: `${material.consumedQty}/${material.requiredQty} sarf`,
    },
    {
      key: 'routing_started',
      label: 'Operasyon baslangic kontrolu',
      passed: workOrder.operations.length === 0 || workOrder.operations.some((operation) => operation.actualStartAt !== null),
      detail: `${workOrder.operations.length} operasyon`,
    },
    {
      key: 'traceability',
      label: 'Urun ve is emri izlenebilirligi',
      passed: workOrder.number.length > 0 && workOrder.product.code.length > 0,
      detail: `${workOrder.number} / ${workOrder.product.code}`,
    },
  ];

  return {
    id: `${workOrder.id}:input`,
    type: 'INPUT',
    status: formStatus(checklist),
    workOrderId: workOrder.id,
    workOrderNumber: workOrder.number,
    product: entityRef(workOrder.product),
    plannedQty: roundQty(plannedQty),
    producedQty: roundQty(producedQty),
    completionPct: completionPct(producedQty, plannedQty),
    checklist,
  };
}

function buildOutputForm(workOrder: QualityWorkOrderLookup): QualityFormRow {
  const plannedQty = decimalToNumber(workOrder.plannedQty);
  const producedQty = decimalToNumber(workOrder.producedQty);
  const scrapQty = decimalToNumber(workOrder.scrapQty);
  const operations = operationCoverage(workOrder);
  const checklist: QualityChecklistItem[] = [
    {
      key: 'operation_completion',
      label: 'Operasyon kapanis kontrolu',
      passed: operations.pct >= 100,
      detail: `${operations.completed}/${operations.total} tamamlandi`,
    },
    {
      key: 'output_quantity',
      label: 'Cikti miktar kontrolu',
      passed: plannedQty <= 0 || producedQty >= plannedQty,
      detail: `${roundQty(producedQty)}/${roundQty(plannedQty)} uretildi`,
    },
    {
      key: 'scrap_review',
      label: 'Fire ve uygunsuzluk kontrolu',
      passed: scrapQty <= 0,
      detail: scrapQty > 0 ? `${roundQty(scrapQty)} fire` : 'Fire yok',
    },
  ];

  return {
    id: `${workOrder.id}:output`,
    type: 'OUTPUT',
    status: formStatus(checklist),
    workOrderId: workOrder.id,
    workOrderNumber: workOrder.number,
    product: entityRef(workOrder.product),
    plannedQty: roundQty(plannedQty),
    producedQty: roundQty(producedQty),
    completionPct: completionPct(producedQty, plannedQty),
    checklist,
  };
}

function issueSeverity(workOrder: QualityWorkOrderLookup, impactQty: number): QualityIssueSeverity {
  const plannedQty = decimalToNumber(workOrder.plannedQty);
  if (workOrder.status === WorkOrderStatus.PAUSED) return 'high';
  if (plannedQty > 0 && impactQty / plannedQty >= 0.1) return 'critical';
  if (impactQty > 0) return 'high';
  return 'medium';
}

function buildNonconformities(workOrder: QualityWorkOrderLookup): QualityNonconformityRow[] {
  const plannedQty = decimalToNumber(workOrder.plannedQty);
  const producedQty = decimalToNumber(workOrder.producedQty);
  const scrapQty = decimalToNumber(workOrder.scrapQty);
  const material = materialCoverage(workOrder);
  const detectedAt = workOrder.endDate ?? workOrder.updatedAt;
  const rows: QualityNonconformityRow[] = [];

  if (scrapQty > 0) {
    rows.push({
      id: `${workOrder.id}:scrap`,
      type: 'scrap',
      severity: issueSeverity(workOrder, scrapQty),
      workOrderId: workOrder.id,
      workOrderNumber: workOrder.number,
      product: entityRef(workOrder.product),
      title: 'Fire kaydi',
      detail: workOrder.scrapReason ?? `${roundQty(scrapQty)} birim fire bildirildi.`,
      quantityImpact: roundQty(scrapQty),
      detectedAt: detectedAt.toISOString(),
    });
  }

  if (workOrder.status === WorkOrderStatus.COMPLETED && plannedQty > producedQty) {
    const impactQty = plannedQty - producedQty;
    rows.push({
      id: `${workOrder.id}:under-production`,
      type: 'under_production',
      severity: issueSeverity(workOrder, impactQty),
      workOrderId: workOrder.id,
      workOrderNumber: workOrder.number,
      product: entityRef(workOrder.product),
      title: 'Eksik uretim',
      detail: `Planlanan miktarin ${roundQty(impactQty)} birimi tamamlanmadi.`,
      quantityImpact: roundQty(impactQty),
      detectedAt: detectedAt.toISOString(),
    });
  }

  if (workOrder.status === WorkOrderStatus.IN_PROGRESS && material.pct < 95) {
    const impactQty = Math.max(0, material.requiredQty - material.consumedQty);
    rows.push({
      id: `${workOrder.id}:material-shortage`,
      type: 'material_shortage',
      severity: issueSeverity(workOrder, impactQty),
      workOrderId: workOrder.id,
      workOrderNumber: workOrder.number,
      product: entityRef(workOrder.product),
      title: 'Girdi malzeme eksigi',
      detail: `Sarf orani %${material.pct}; kalite giris kontrolu bekliyor.`,
      quantityImpact: roundQty(impactQty),
      detectedAt: workOrder.updatedAt.toISOString(),
    });
  }

  if (workOrder.status === WorkOrderStatus.PAUSED) {
    rows.push({
      id: `${workOrder.id}:paused`,
      type: 'paused_order',
      severity: 'high',
      workOrderId: workOrder.id,
      workOrderNumber: workOrder.number,
      product: entityRef(workOrder.product),
      title: 'Durdurulmus is emri',
      detail: 'Is emri durdu; kalite veya proses kok neden kontrolu gerekli.',
      quantityImpact: roundQty(Math.max(0, plannedQty - producedQty)),
      detectedAt: workOrder.updatedAt.toISOString(),
    });
  }

  return rows;
}

function priorityValue(priority: Priority): QualityCorrectiveActionRow['priority'] {
  if (priority === Priority.CRITICAL) return 'critical';
  if (priority === Priority.HIGH) return 'high';
  if (priority === Priority.LOW) return 'low';
  return 'medium';
}

function taskStatusValue(status: TaskStatus): QualityCorrectiveActionRow['status'] {
  if (status === TaskStatus.IN_PROGRESS) return 'in_progress';
  if (status === TaskStatus.DONE) return 'done';
  return 'open';
}

function suggestedPriority(severity: QualityIssueSeverity): QualityCorrectiveActionRow['priority'] {
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'high';
  if (severity === 'low') return 'low';
  return 'medium';
}

export async function getQualityControl(
  db: QualityControlDbClient,
  input: QualityControlInput,
): Promise<QualityControlResult> {
  const { tenantId, horizonDays } = input;
  const { start, end } = getPlanningWindow(horizonDays);

  const workOrders = await db.workOrder.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: { in: [...ACTIVE_WORK_ORDER_STATUSES] },
      OR: [
        {
          status: { in: [...OPEN_QUALITY_WORK_ORDER_STATUSES] },
          OR: [
            { startDate: null, endDate: null },
            { startDate: null, endDate: { gte: start } },
            { startDate: { lte: end }, endDate: null },
            { startDate: { lte: end }, endDate: { gte: start } },
            { updatedAt: { gte: start, lte: end } },
          ],
        },
        {
          status: WorkOrderStatus.COMPLETED,
          OR: [
            { endDate: { gte: start, lte: end } },
            { updatedAt: { gte: start, lte: end } },
          ],
        },
      ],
    },
    select: {
      id: true,
      number: true,
      status: true,
      plannedQty: true,
      producedQty: true,
      scrapQty: true,
      scrapReason: true,
      startDate: true,
      endDate: true,
      updatedAt: true,
      product: { select: { id: true, code: true, name: true } },
      items: {
        select: {
          id: true,
          requiredQty: true,
          consumedQty: true,
          product: { select: { id: true, code: true, name: true } },
        },
        orderBy: { id: 'asc' },
      },
      operations: {
        select: {
          id: true,
          status: true,
          actualStartAt: true,
          actualEndAt: true,
        },
        orderBy: { stepOrder: 'asc' },
      },
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: 100,
  });

  const inputForms = workOrders
    .filter((workOrder) => workOrder.status !== WorkOrderStatus.COMPLETED)
    .map(buildInputForm);
  const outputForms = workOrders
    .filter((workOrder) => workOrder.status !== WorkOrderStatus.PLANNED)
    .map(buildOutputForm);
  const nonconformities = workOrders.flatMap(buildNonconformities);

  const workOrderById = new Map(workOrders.map((workOrder) => [workOrder.id, workOrder]));
  const tasks = await db.task.findMany({
    where: {
      tenantId,
      module: 'production',
      status: { in: [...OPEN_TASK_STATUSES] },
      OR: [
        { entityType: EntityType.WORK_ORDER, entityId: { in: Array.from(workOrderById.keys()) } },
        { source: { startsWith: 'quality:' } },
      ],
    },
    select: {
      id: true,
      title: true,
      detail: true,
      status: true,
      priority: true,
      entityId: true,
      dueAt: true,
    },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    take: 50,
  });

  const correctiveActions: QualityCorrectiveActionRow[] = tasks
    .map((task: QualityTaskLookup) => {
      const workOrder = task.entityId ? workOrderById.get(task.entityId) : undefined;
      if (!workOrder) return null;
      return {
        id: task.id,
        source: 'task',
        status: taskStatusValue(task.status),
        priority: priorityValue(task.priority),
        workOrderId: workOrder.id,
        workOrderNumber: workOrder.number,
        title: task.title,
        detail: task.detail,
        dueAt: toIso(task.dueAt),
      };
    })
    .filter((row): row is QualityCorrectiveActionRow => row !== null);

  const actionWorkOrderIds = new Set(correctiveActions.map((action) => action.workOrderId));
  for (const issue of nonconformities) {
    if (actionWorkOrderIds.has(issue.workOrderId)) continue;
    correctiveActions.push({
      id: `${issue.id}:suggested-action`,
      source: 'suggested',
      status: 'suggested',
      priority: suggestedPriority(issue.severity),
      workOrderId: issue.workOrderId,
      workOrderNumber: issue.workOrderNumber,
      title: `${issue.title} icin duzeltici faaliyet`,
      detail: issue.detail,
      dueAt: null,
    });
    actionWorkOrderIds.add(issue.workOrderId);
  }

  return {
    summary: {
      horizonDays,
      inputFormCount: inputForms.length,
      outputFormCount: outputForms.length,
      blockedFormCount: [...inputForms, ...outputForms].filter((form) => form.status === 'blocked').length,
      nonconformityCount: nonconformities.length,
      criticalIssueCount: nonconformities.filter((issue) => issue.severity === 'critical').length,
      correctiveActionCount: correctiveActions.length,
    },
    inputForms,
    outputForms,
    nonconformities,
    correctiveActions,
  };
}
