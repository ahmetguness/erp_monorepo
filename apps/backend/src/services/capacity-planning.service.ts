import { WorkOrderStatus } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

type CapacityPlanningDbClient = PrismaClient;

const OPEN_WORK_ORDER_STATUSES: readonly WorkOrderStatus[] = [
  WorkOrderStatus.PLANNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.PAUSED,
];

const OPEN_OPERATION_STATUSES: readonly WorkOrderStatus[] = [
  WorkOrderStatus.PLANNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.PAUSED,
];

const STANDARD_SHIFT_HOURS = 8;

export interface CapacityPlanningInput {
  tenantId: string;
  horizonDays: number;
}

export interface CapacityWorkCenterRef {
  id: string;
  code: string;
  name: string;
}

export interface CapacityShiftSummary {
  shiftCount: number;
  hoursPerShift: number;
  totalHours: number;
}

export interface CapacityCalendarRow {
  workCenter: CapacityWorkCenterRef;
  date: string;
  capacityHours: number;
  allocatedHours: number;
  availableHours: number;
  utilizationPct: number;
  shifts: CapacityShiftSummary;
}

export interface CapacityBottleneckRow {
  workCenter: CapacityWorkCenterRef;
  capacityHours: number;
  allocatedHours: number;
  queuedHours: number;
  totalLoadHours: number;
  availableHours: number;
  utilizationPct: number;
  severity: 'normal' | 'watch' | 'critical';
}

export interface CapacitySequenceRow {
  id: string;
  workOrderId: string;
  workOrderNumber: string;
  product: CapacityWorkCenterRef;
  workCenter: CapacityWorkCenterRef;
  operationName: string;
  status: WorkOrderStatus;
  stepOrder: number;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  workOrderStartDate: string | null;
  workOrderEndDate: string | null;
  plannedQty: number;
  estimatedHours: number;
  queueRank: number;
}

export interface CapacityPlanningSummary {
  horizonDays: number;
  workCenterCount: number;
  calendarDays: number;
  bottleneckCount: number;
  criticalBottleneckCount: number;
  queuedOperationCount: number;
}

export interface CapacityPlanningResult {
  summary: CapacityPlanningSummary;
  calendar: CapacityCalendarRow[];
  bottlenecks: CapacityBottleneckRow[];
  sequence: CapacitySequenceRow[];
}

interface WorkCenterLookup {
  id: string;
  code: string;
  name: string;
  capacity: unknown;
}

interface CapacityLookup {
  workCenterId: string;
  date: Date;
  capacity: unknown;
  allocated: unknown;
}

interface OperationLookup {
  id: string;
  workCenterId: string;
  name: string;
  status: WorkOrderStatus;
  stepOrder: number;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  plannedSetupTime: unknown;
  plannedRunTime: unknown;
  workCenter: WorkCenterLookup;
  workOrder: {
    id: string;
    number: string;
    plannedQty: unknown;
    startDate: Date | null;
    endDate: Date | null;
    product: CapacityWorkCenterRef;
  };
}

function decimalToNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

function workCenterDailyCapacity(value: unknown): number {
  const parsed = decimalToNumber(value);
  return parsed > 0 ? parsed : STANDARD_SHIFT_HOURS;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function workCenterRef(workCenter: CapacityWorkCenterRef): CapacityWorkCenterRef {
  return { id: workCenter.id, code: workCenter.code, name: workCenter.name };
}

function getPlanningWindow(horizonDays: number): { start: Date; end: Date; dates: Date[] } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + horizonDays - 1);
  end.setUTCHours(23, 59, 59, 999);

  const dates: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { start, end, dates };
}

function buildShiftSummary(capacityHours: number): CapacityShiftSummary {
  const totalHours = Math.max(0, capacityHours);
  if (totalHours <= 0) return { shiftCount: 0, hoursPerShift: 0, totalHours: 0 };
  const shiftCount = Math.max(1, Math.ceil(totalHours / STANDARD_SHIFT_HOURS));
  return {
    shiftCount,
    hoursPerShift: roundHours(totalHours / shiftCount),
    totalHours: roundHours(totalHours),
  };
}

function operationEstimatedHours(operation: OperationLookup): number {
  const setupHours = decimalToNumber(operation.plannedSetupTime) / 60;
  const runHours = (decimalToNumber(operation.plannedRunTime) * decimalToNumber(operation.workOrder.plannedQty)) / 60;
  return Math.max(0, setupHours + runHours);
}

function operationSortValue(operation: OperationLookup): number {
  return (
    operation.plannedStartAt?.getTime()
    ?? operation.workOrder.startDate?.getTime()
    ?? operation.workOrder.endDate?.getTime()
    ?? Number.MAX_SAFE_INTEGER
  );
}

function capacityKey(workCenterId: string, date: Date): string {
  return `${workCenterId}:${dateKey(date)}`;
}

function severityOf(utilizationPct: number): CapacityBottleneckRow['severity'] {
  if (utilizationPct >= 100) return 'critical';
  if (utilizationPct >= 85) return 'watch';
  return 'normal';
}

export async function getCapacityPlanning(
  db: CapacityPlanningDbClient,
  input: CapacityPlanningInput,
): Promise<CapacityPlanningResult> {
  const { tenantId, horizonDays } = input;
  const { start, end, dates } = getPlanningWindow(horizonDays);

  const [workCenters, capacityRows, operations] = await Promise.all([
    db.workCenter.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, name: true, capacity: true },
      orderBy: { code: 'asc' },
    }),
    db.workCenterCapacity.findMany({
      where: { tenantId, date: { gte: start, lte: end } },
      select: { workCenterId: true, date: true, capacity: true, allocated: true },
      orderBy: [{ date: 'asc' }],
    }),
    db.workOrderOperation.findMany({
      where: {
        tenantId,
        status: { in: [...OPEN_OPERATION_STATUSES] },
        workOrder: {
          tenantId,
          deletedAt: null,
          status: { in: [...OPEN_WORK_ORDER_STATUSES] },
          OR: [
            { startDate: null, endDate: null },
            { startDate: null, endDate: { gte: start } },
            { startDate: { lte: end }, endDate: null },
            { startDate: { lte: end }, endDate: { gte: start } },
          ],
        },
      },
      select: {
        id: true,
        workCenterId: true,
        name: true,
        status: true,
        stepOrder: true,
        plannedStartAt: true,
        plannedEndAt: true,
        plannedSetupTime: true,
        plannedRunTime: true,
        workCenter: { select: { id: true, code: true, name: true, capacity: true } },
        workOrder: {
          select: {
            id: true,
            number: true,
            plannedQty: true,
            startDate: true,
            endDate: true,
            product: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: [{ workCenterId: 'asc' }, { stepOrder: 'asc' }],
    }),
  ]);

  const capacityByKey = new Map<string, CapacityLookup>();
  for (const row of capacityRows) {
    capacityByKey.set(capacityKey(row.workCenterId, row.date), row);
  }

  const calendar: CapacityCalendarRow[] = [];
  const totalsByWorkCenter = new Map<string, { capacityHours: number; allocatedHours: number; queuedHours: number }>();

  for (const workCenter of workCenters) {
    const totals = { capacityHours: 0, allocatedHours: 0, queuedHours: 0 };
    totalsByWorkCenter.set(workCenter.id, totals);

    for (const date of dates) {
      const capacity = capacityByKey.get(capacityKey(workCenter.id, date));
      const capacityHours = capacity ? decimalToNumber(capacity.capacity) : workCenterDailyCapacity(workCenter.capacity);
      const allocatedHours = capacity ? decimalToNumber(capacity.allocated) : 0;
      const availableHours = Math.max(0, capacityHours - allocatedHours);
      totals.capacityHours += capacityHours;
      totals.allocatedHours += allocatedHours;

      calendar.push({
        workCenter: workCenterRef(workCenter),
        date: dateKey(date),
        capacityHours: roundHours(capacityHours),
        allocatedHours: roundHours(allocatedHours),
        availableHours: roundHours(availableHours),
        utilizationPct: capacityHours > 0 ? roundPct((allocatedHours / capacityHours) * 100) : 0,
        shifts: buildShiftSummary(capacityHours),
      });
    }
  }

  const sortedOperations = [...operations].sort((left, right) => {
    const byDate = operationSortValue(left) - operationSortValue(right);
    if (byDate !== 0) return byDate;
    const byWorkCenter = left.workCenter.code.localeCompare(right.workCenter.code);
    if (byWorkCenter !== 0) return byWorkCenter;
    return left.stepOrder - right.stepOrder;
  });

  const rankByWorkCenter = new Map<string, number>();
  const sequence = sortedOperations.map((operation) => {
    const estimatedHours = operationEstimatedHours(operation);
    const totals = totalsByWorkCenter.get(operation.workCenterId);
    if (totals) totals.queuedHours += estimatedHours;
    const queueRank = (rankByWorkCenter.get(operation.workCenterId) ?? 0) + 1;
    rankByWorkCenter.set(operation.workCenterId, queueRank);

    return {
      id: operation.id,
      workOrderId: operation.workOrder.id,
      workOrderNumber: operation.workOrder.number,
      product: workCenterRef(operation.workOrder.product),
      workCenter: workCenterRef(operation.workCenter),
      operationName: operation.name,
      status: operation.status,
      stepOrder: operation.stepOrder,
      plannedStartAt: toIso(operation.plannedStartAt),
      plannedEndAt: toIso(operation.plannedEndAt),
      workOrderStartDate: toIso(operation.workOrder.startDate),
      workOrderEndDate: toIso(operation.workOrder.endDate),
      plannedQty: roundHours(decimalToNumber(operation.workOrder.plannedQty)),
      estimatedHours: roundHours(estimatedHours),
      queueRank,
    };
  });

  const bottlenecks = Array.from(totalsByWorkCenter.entries()).map(([workCenterId, totals]) => {
    const workCenter = workCenters.find((item) => item.id === workCenterId);
    const totalLoadHours = totals.allocatedHours + totals.queuedHours;
    const utilizationPct = totals.capacityHours > 0 ? (totalLoadHours / totals.capacityHours) * 100 : 0;
    return {
      workCenter: workCenter ? workCenterRef(workCenter) : { id: workCenterId, code: '-', name: '-' },
      capacityHours: roundHours(totals.capacityHours),
      allocatedHours: roundHours(totals.allocatedHours),
      queuedHours: roundHours(totals.queuedHours),
      totalLoadHours: roundHours(totalLoadHours),
      availableHours: roundHours(Math.max(0, totals.capacityHours - totals.allocatedHours)),
      utilizationPct: roundPct(utilizationPct),
      severity: severityOf(utilizationPct),
    };
  }).sort((left, right) => right.utilizationPct - left.utilizationPct);

  return {
    summary: {
      horizonDays,
      workCenterCount: workCenters.length,
      calendarDays: dates.length,
      bottleneckCount: bottlenecks.filter((row) => row.severity !== 'normal').length,
      criticalBottleneckCount: bottlenecks.filter((row) => row.severity === 'critical').length,
      queuedOperationCount: sequence.length,
    },
    calendar,
    bottlenecks,
    sequence,
  };
}
