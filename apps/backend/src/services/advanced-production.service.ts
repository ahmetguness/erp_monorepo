import { Priority, TaskStatus, WorkOrderStatus } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

type AdvancedProductionDbClient = PrismaClient;

const OPEN_WORK_ORDER_STATUSES: readonly WorkOrderStatus[] = [
  WorkOrderStatus.PLANNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.PAUSED,
];

const OPEN_TASK_STATUSES: readonly TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
];

export interface AdvancedProductionInput {
  tenantId: string;
  horizonDays: number;
}

export interface AdvancedProductionRef {
  id: string;
  code: string;
  name: string;
}

export interface AdvancedProductionSummary {
  horizonDays: number;
  openWorkOrderCount: number;
  capacityRiskCount: number;
  qualityRiskCount: number;
  maintenanceActionCount: number;
  scrapRatePct: number;
  operationCostVariancePct: number;
}

export interface AdvancedCapacityPlanRow {
  workCenter: AdvancedProductionRef;
  capacityHours: number;
  allocatedHours: number;
  queuedHours: number;
  utilizationPct: number;
  shiftCount: number;
  recommendation: string;
}

export interface AdvancedQualitySignalRow {
  workOrderId: string;
  workOrderNumber: string;
  product: AdvancedProductionRef;
  signal: 'scrap' | 'under_production' | 'material_shortage' | 'paused_order';
  severity: 'low' | 'medium' | 'high' | 'critical';
  detail: string;
}

export interface AdvancedMaintenanceRow {
  workCenter: AdvancedProductionRef;
  openTaskCount: number;
  utilizationPct: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

export interface AdvancedScrapRow {
  workOrderId: string;
  workOrderNumber: string;
  product: AdvancedProductionRef;
  plannedQty: number;
  producedQty: number;
  scrapQty: number;
  scrapRatePct: number;
  scrapCost: number;
  reason: string | null;
}

export interface AdvancedShiftRow {
  workCenter: AdvancedProductionRef;
  date: string;
  capacityHours: number;
  shiftCount: number;
  hoursPerShift: number;
  utilizationPct: number;
}

export interface AdvancedOperationCostRow {
  operationId: string;
  workOrderId: string;
  workOrderNumber: string;
  operationName: string;
  workCenter: AdvancedProductionRef;
  plannedHours: number;
  actualHours: number;
  laborCost: number;
  overheadCost: number;
  totalCost: number;
  variancePct: number;
}

export interface AdvancedProductionResult {
  generatedAt: string;
  summary: AdvancedProductionSummary;
  capacityPlan: AdvancedCapacityPlanRow[];
  qualitySignals: AdvancedQualitySignalRow[];
  maintenancePlan: AdvancedMaintenanceRow[];
  scrapAnalysis: AdvancedScrapRow[];
  shiftPlan: AdvancedShiftRow[];
  operationCosts: AdvancedOperationCostRow[];
}

interface WorkCenterLookup {
  id: string;
  code: string;
  name: string;
  capacity: unknown;
  laborRate: unknown;
  overheadRate: unknown;
}

interface WorkOrderLookup {
  id: string;
  number: string;
  status: WorkOrderStatus;
  plannedQty: unknown;
  producedQty: unknown;
  scrapQty: unknown;
  scrapCost: unknown;
  scrapReason: string | null;
  startDate: Date | null;
  endDate: Date | null;
  product: AdvancedProductionRef;
  items: Array<{
    requiredQty: unknown;
    consumedQty: unknown;
  }>;
  operations: Array<{
    id: string;
    name: string;
    status: WorkOrderStatus;
    plannedSetupTime: unknown;
    plannedRunTime: unknown;
    actualSetupTime: unknown;
    actualRunTime: unknown;
    actualStartAt: Date | null;
    actualEndAt: Date | null;
    workCenter: WorkCenterLookup;
  }>;
}

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 2): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return round((part / total) * 100, 1);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function ref(value: AdvancedProductionRef): AdvancedProductionRef {
  return { id: value.id, code: value.code, name: value.name };
}

function windowFor(horizonDays: number): { start: Date; end: Date } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + horizonDays - 1);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

function plannedOperationHours(operation: WorkOrderLookup['operations'][number], plannedQty: number): number {
  return Math.max(0, (numeric(operation.plannedSetupTime) + numeric(operation.plannedRunTime) * plannedQty) / 60);
}

function actualOperationHours(operation: WorkOrderLookup['operations'][number], plannedQty: number): number {
  const explicit = numeric(operation.actualSetupTime) + numeric(operation.actualRunTime) * plannedQty;
  if (explicit > 0) return explicit / 60;
  if (operation.actualStartAt && operation.actualEndAt) {
    return Math.max(0, (operation.actualEndAt.getTime() - operation.actualStartAt.getTime()) / 3_600_000);
  }
  return 0;
}

function materialCoverage(workOrder: WorkOrderLookup): number {
  const required = workOrder.items.reduce((sum, item) => sum + numeric(item.requiredQty), 0);
  const consumed = workOrder.items.reduce((sum, item) => sum + numeric(item.consumedQty), 0);
  return required > 0 ? pct(consumed, required) : 100;
}

function severityByPct(value: number): AdvancedQualitySignalRow['severity'] {
  if (value >= 20) return 'critical';
  if (value >= 10) return 'high';
  if (value >= 5) return 'medium';
  return 'low';
}

function taskPriority(priority: Priority): AdvancedMaintenanceRow['priority'] {
  if (priority === Priority.CRITICAL) return 'critical';
  if (priority === Priority.HIGH) return 'high';
  if (priority === Priority.LOW) return 'low';
  return 'medium';
}

function strongestPriority(values: AdvancedMaintenanceRow['priority'][]): AdvancedMaintenanceRow['priority'] {
  if (values.includes('critical')) return 'critical';
  if (values.includes('high')) return 'high';
  if (values.includes('medium')) return 'medium';
  return 'low';
}

function capacityRecommendation(utilizationPct: number): string {
  if (utilizationPct >= 100) return 'Ek vardiya veya dis kaynak planla';
  if (utilizationPct >= 85) return 'Vardiya dagilimini ve operasyon sirasini gozden gecir';
  return 'Kapasite normal';
}

function shiftCountFor(capacityHours: number): number {
  if (capacityHours <= 0) return 0;
  return Math.max(1, Math.ceil(capacityHours / 8));
}

export async function getAdvancedProduction(
  db: AdvancedProductionDbClient,
  input: AdvancedProductionInput,
): Promise<AdvancedProductionResult> {
  const { tenantId, horizonDays } = input;
  const { start, end } = windowFor(horizonDays);

  const [workCenters, workOrders, capacities, maintenanceTasks] = await Promise.all([
    db.workCenter.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, name: true, capacity: true, laborRate: true, overheadRate: true },
      orderBy: { code: 'asc' },
    }),
    db.workOrder.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          { status: { in: [...OPEN_WORK_ORDER_STATUSES] } },
          { updatedAt: { gte: start } },
          { startDate: { lte: end }, endDate: null },
          { startDate: { lte: end }, endDate: { gte: start } },
        ],
      },
      select: {
        id: true,
        number: true,
        status: true,
        plannedQty: true,
        producedQty: true,
        scrapQty: true,
        scrapCost: true,
        scrapReason: true,
        startDate: true,
        endDate: true,
        product: { select: { id: true, code: true, name: true } },
        items: { select: { requiredQty: true, consumedQty: true } },
        operations: {
          select: {
            id: true,
            name: true,
            status: true,
            plannedSetupTime: true,
            plannedRunTime: true,
            actualSetupTime: true,
            actualRunTime: true,
            actualStartAt: true,
            actualEndAt: true,
            workCenter: { select: { id: true, code: true, name: true, capacity: true, laborRate: true, overheadRate: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
    db.workCenterCapacity.findMany({
      where: { tenantId, date: { gte: start, lte: end } },
      select: {
        workCenterId: true,
        date: true,
        capacity: true,
        allocated: true,
        workCenter: { select: { id: true, code: true, name: true, capacity: true, laborRate: true, overheadRate: true } },
      },
      orderBy: [{ date: 'asc' }],
    }),
    db.task.findMany({
      where: {
        tenantId,
        status: { in: [...OPEN_TASK_STATUSES] },
        OR: [
          { module: 'production' },
          { module: 'service' },
          { source: { startsWith: 'maintenance:' } },
        ],
      },
      select: { entityId: true, priority: true },
    }),
  ]);

  const capacityTotals = new Map<string, { workCenter: WorkCenterLookup; capacityHours: number; allocatedHours: number; queuedHours: number }>();
  const explicitCapacityDates = new Map<string, Set<string>>();
  for (const workCenter of workCenters) {
    capacityTotals.set(workCenter.id, {
      workCenter,
      capacityHours: 0,
      allocatedHours: 0,
      queuedHours: 0,
    });
    explicitCapacityDates.set(workCenter.id, new Set<string>());
  }

  const shiftPlan = capacities.slice(0, 60).map((row): AdvancedShiftRow => {
    const capacityHours = numeric(row.capacity);
    const allocatedHours = numeric(row.allocated);
    const shiftCount = shiftCountFor(capacityHours);
    const totals = capacityTotals.get(row.workCenterId);
    if (totals) {
      explicitCapacityDates.get(row.workCenterId)?.add(dateKey(row.date));
      totals.capacityHours += capacityHours;
      totals.allocatedHours += allocatedHours;
    }
    return {
      workCenter: ref(row.workCenter),
      date: dateKey(row.date),
      capacityHours: round(capacityHours),
      shiftCount,
      hoursPerShift: shiftCount > 0 ? round(capacityHours / shiftCount) : 0,
      utilizationPct: pct(allocatedHours, capacityHours),
    };
  });

  for (const [workCenterId, totals] of capacityTotals.entries()) {
    const explicitDays = explicitCapacityDates.get(workCenterId)?.size ?? 0;
    const missingDays = Math.max(horizonDays - explicitDays, 0);
    totals.capacityHours += Math.max(numeric(totals.workCenter.capacity), 8) * missingDays;
  }

  const qualitySignals: AdvancedQualitySignalRow[] = [];
  const scrapAnalysis: AdvancedScrapRow[] = [];
  const operationCosts: AdvancedOperationCostRow[] = [];

  for (const workOrder of workOrders) {
    const plannedQty = numeric(workOrder.plannedQty);
    const producedQty = numeric(workOrder.producedQty);
    const scrapQty = numeric(workOrder.scrapQty);
    const scrapRatePct = pct(scrapQty, producedQty + scrapQty);
    const product = ref(workOrder.product);

    if (scrapQty > 0) {
      scrapAnalysis.push({
        workOrderId: workOrder.id,
        workOrderNumber: workOrder.number,
        product,
        plannedQty: round(plannedQty, 3),
        producedQty: round(producedQty, 3),
        scrapQty: round(scrapQty, 3),
        scrapRatePct,
        scrapCost: round(numeric(workOrder.scrapCost)),
        reason: workOrder.scrapReason,
      });
      qualitySignals.push({
        workOrderId: workOrder.id,
        workOrderNumber: workOrder.number,
        product,
        signal: 'scrap',
        severity: severityByPct(scrapRatePct),
        detail: `${scrapRatePct}% fire orani`,
      });
    }

    const completionPct = pct(producedQty, plannedQty);
    if (workOrder.status === WorkOrderStatus.COMPLETED && completionPct < 95) {
      qualitySignals.push({
        workOrderId: workOrder.id,
        workOrderNumber: workOrder.number,
        product,
        signal: 'under_production',
        severity: completionPct < 80 ? 'high' : 'medium',
        detail: `${completionPct}% tamamlanma`,
      });
    }

    const materialPct = materialCoverage(workOrder);
    if (materialPct < 95 && workOrder.status !== WorkOrderStatus.COMPLETED) {
      qualitySignals.push({
        workOrderId: workOrder.id,
        workOrderNumber: workOrder.number,
        product,
        signal: 'material_shortage',
        severity: materialPct < 70 ? 'high' : 'medium',
        detail: `${materialPct}% malzeme sarfi`,
      });
    }

    if (workOrder.status === WorkOrderStatus.PAUSED) {
      qualitySignals.push({
        workOrderId: workOrder.id,
        workOrderNumber: workOrder.number,
        product,
        signal: 'paused_order',
        severity: 'medium',
        detail: 'Is emri duraklatildi',
      });
    }

    for (const operation of workOrder.operations) {
      const plannedHours = plannedOperationHours(operation, plannedQty);
      const actualHours = actualOperationHours(operation, plannedQty);
      const hoursForCost = actualHours > 0 ? actualHours : plannedHours;
      const laborCost = hoursForCost * numeric(operation.workCenter.laborRate);
      const overheadCost = hoursForCost * numeric(operation.workCenter.overheadRate);
      const totals = capacityTotals.get(operation.workCenter.id);
      if (totals && workOrder.status !== WorkOrderStatus.COMPLETED) totals.queuedHours += plannedHours;

      operationCosts.push({
        operationId: operation.id,
        workOrderId: workOrder.id,
        workOrderNumber: workOrder.number,
        operationName: operation.name,
        workCenter: ref(operation.workCenter),
        plannedHours: round(plannedHours),
        actualHours: round(actualHours),
        laborCost: round(laborCost),
        overheadCost: round(overheadCost),
        totalCost: round(laborCost + overheadCost),
        variancePct: plannedHours > 0 && actualHours > 0 ? pct(actualHours - plannedHours, plannedHours) : 0,
      });
    }
  }

  const capacityPlan = [...capacityTotals.values()]
    .map((row): AdvancedCapacityPlanRow => {
      const totalLoadHours = row.allocatedHours + row.queuedHours;
      const utilizationPct = pct(totalLoadHours, row.capacityHours);
      return {
        workCenter: ref(row.workCenter),
        capacityHours: round(row.capacityHours),
        allocatedHours: round(row.allocatedHours),
        queuedHours: round(row.queuedHours),
        utilizationPct,
        shiftCount: shiftCountFor(row.capacityHours / Math.max(horizonDays, 1)),
        recommendation: capacityRecommendation(utilizationPct),
      };
    })
    .sort((left, right) => right.utilizationPct - left.utilizationPct);

  const taskPrioritiesByEntity = new Map<string, AdvancedMaintenanceRow['priority'][]>();
  for (const task of maintenanceTasks) {
    if (!task.entityId) continue;
    const current = taskPrioritiesByEntity.get(task.entityId) ?? [];
    current.push(taskPriority(task.priority));
    taskPrioritiesByEntity.set(task.entityId, current);
  }

  const maintenancePlan = capacityPlan
    .filter((row) => row.utilizationPct >= 85 || (taskPrioritiesByEntity.get(row.workCenter.id)?.length ?? 0) > 0)
    .map((row): AdvancedMaintenanceRow => {
      const priorities = taskPrioritiesByEntity.get(row.workCenter.id) ?? [];
      const utilizationPriority: AdvancedMaintenanceRow['priority'] = row.utilizationPct >= 100 ? 'high' : row.utilizationPct >= 85 ? 'medium' : 'low';
      return {
        workCenter: row.workCenter,
        openTaskCount: priorities.length,
        utilizationPct: row.utilizationPct,
        priority: strongestPriority([...priorities, utilizationPriority]),
        recommendation: row.utilizationPct >= 100 ? 'Planli bakim penceresi ac' : 'Bakim ve temizlik kontrolu planla',
      };
    })
    .slice(0, 12);

  const totalScrapQty = scrapAnalysis.reduce((sum, row) => sum + row.scrapQty, 0);
  const totalProducedQty = scrapAnalysis.reduce((sum, row) => sum + row.producedQty, 0);
  const varianceRows = operationCosts.filter((row) => row.variancePct !== 0);
  const operationCostVariancePct = varianceRows.length === 0
    ? 0
    : round(varianceRows.reduce((sum, row) => sum + row.variancePct, 0) / varianceRows.length, 1);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      horizonDays,
      openWorkOrderCount: workOrders.filter((row) => OPEN_WORK_ORDER_STATUSES.includes(row.status)).length,
      capacityRiskCount: capacityPlan.filter((row) => row.utilizationPct >= 85).length,
      qualityRiskCount: qualitySignals.filter((row) => row.severity === 'high' || row.severity === 'critical').length,
      maintenanceActionCount: maintenancePlan.length,
      scrapRatePct: pct(totalScrapQty, totalProducedQty + totalScrapQty),
      operationCostVariancePct,
    },
    capacityPlan: capacityPlan.slice(0, 12),
    qualitySignals: qualitySignals.slice(0, 20),
    maintenancePlan,
    scrapAnalysis: scrapAnalysis.sort((a, b) => b.scrapRatePct - a.scrapRatePct).slice(0, 20),
    shiftPlan,
    operationCosts: operationCosts.sort((a, b) => b.totalCost - a.totalCost).slice(0, 20),
  };
}
