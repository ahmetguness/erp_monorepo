import type { PrismaClient } from '@prisma/client';

type ProductionEngineeringDbClient = PrismaClient;

export interface ProductionEngineeringRef {
  id: string;
  code: string;
  name: string;
}

export interface BomRevisionRow {
  id: string;
  version: string;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  itemCount: number;
  routingCount: number;
  workOrderCount: number;
  status: 'active' | 'future' | 'expired' | 'draft';
}

export interface AlternativeMaterialRow {
  bomItemId: string;
  primaryProduct: ProductionEngineeringRef;
  requiredQty: number;
  unit: string;
  primaryUnitCost: number;
  alternatives: Array<{
    product: ProductionEngineeringRef;
    availableQty: number;
    unitCost: number;
    costDeltaPct: number;
    reason: string;
  }>;
}

export interface OperationRouteRow {
  routingId: string;
  stepOrder: number;
  operationName: string;
  workCenter: ProductionEngineeringRef;
  setupMinutes: number;
  runMinutesPerUnit: number;
  laborRate: number;
  overheadRate: number;
  plannedCostPerUnit: number;
}

export interface ProductionCostComparisonRow {
  workOrderId: string;
  workOrderNumber: string;
  status: string;
  plannedQty: number;
  producedQty: number;
  plannedCost: number;
  actualCost: number;
  variance: number;
  variancePct: number;
  materialVariance: number;
  laborVariance: number;
  overheadVariance: number;
}

export interface ProductionEngineeringSummary {
  revisionCount: number;
  activeRevisionCount: number;
  alternativeSuggestionCount: number;
  routeStepCount: number;
  plannedCostTotal: number;
  actualCostTotal: number;
  variancePct: number;
}

export interface ProductionEngineeringResult {
  bomId: string;
  generatedAt: string;
  summary: ProductionEngineeringSummary;
  revisions: BomRevisionRow[];
  alternativeMaterials: AlternativeMaterialRow[];
  operationRoutes: OperationRouteRow[];
  costComparison: ProductionCostComparisonRow[];
}

interface ProductCostLookup {
  id: string;
  code: string;
  name: string;
  categoryId: string | null;
  unitId: string;
  purchasePrice: unknown;
  averageCost: unknown;
}

interface BomItemLookup {
  id: string;
  quantity: unknown;
  unit: string | null;
  product: ProductCostLookup;
}

interface BomRoutingLookup {
  id: string;
  name: string;
  stepOrder: number;
  setupTime: unknown;
  runTime: unknown;
  workCenter: {
    id: string;
    code: string;
    name: string;
    laborRate: unknown;
    overheadRate: unknown;
  };
}

interface WorkOrderCostLookup {
  id: string;
  number: string;
  status: string;
  plannedQty: unknown;
  producedQty: unknown;
  estimatedMaterialCost: unknown;
  estimatedLaborCost: unknown;
  estimatedOverheadCost: unknown;
  actualMaterialCost: unknown;
  actualLaborCost: unknown;
  actualOverheadCost: unknown;
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
  if (total === 0) return 0;
  return round((part / total) * 100, 1);
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function productRef(product: ProductCostLookup): ProductionEngineeringRef {
  return { id: product.id, code: product.code, name: product.name };
}

function unitCost(product: Pick<ProductCostLookup, 'averageCost' | 'purchasePrice'>): number {
  return numeric(product.averageCost) || numeric(product.purchasePrice);
}

function revisionStatus(row: { isActive: boolean; effectiveFrom: Date | null; effectiveTo: Date | null }, now: Date): BomRevisionRow['status'] {
  if (!row.isActive) return 'draft';
  if (row.effectiveFrom && row.effectiveFrom > now) return 'future';
  if (row.effectiveTo && row.effectiveTo < now) return 'expired';
  return 'active';
}

function plannedRoutingCostPerUnit(routing: BomRoutingLookup): number {
  const setupHours = numeric(routing.setupTime) / 60;
  const runHours = numeric(routing.runTime) / 60;
  const hourlyRate = numeric(routing.workCenter.laborRate) + numeric(routing.workCenter.overheadRate);
  return round((setupHours + runHours) * hourlyRate);
}

function buildCostRow(workOrder: WorkOrderCostLookup): ProductionCostComparisonRow {
  const plannedMaterial = numeric(workOrder.estimatedMaterialCost);
  const plannedLabor = numeric(workOrder.estimatedLaborCost);
  const plannedOverhead = numeric(workOrder.estimatedOverheadCost);
  const actualMaterial = numeric(workOrder.actualMaterialCost);
  const actualLabor = numeric(workOrder.actualLaborCost);
  const actualOverhead = numeric(workOrder.actualOverheadCost);
  const plannedCost = plannedMaterial + plannedLabor + plannedOverhead;
  const actualCost = actualMaterial + actualLabor + actualOverhead;
  const variance = actualCost - plannedCost;

  return {
    workOrderId: workOrder.id,
    workOrderNumber: workOrder.number,
    status: workOrder.status,
    plannedQty: round(numeric(workOrder.plannedQty), 3),
    producedQty: round(numeric(workOrder.producedQty), 3),
    plannedCost: round(plannedCost),
    actualCost: round(actualCost),
    variance: round(variance),
    variancePct: pct(variance, plannedCost),
    materialVariance: round(actualMaterial - plannedMaterial),
    laborVariance: round(actualLabor - plannedLabor),
    overheadVariance: round(actualOverhead - plannedOverhead),
  };
}

export async function getProductionEngineering(
  db: ProductionEngineeringDbClient,
  tenantId: string,
  bomId: string,
): Promise<ProductionEngineeringResult | null> {
  const bom = await db.bOM.findFirst({
    where: { id: bomId, tenantId },
    select: { id: true, productId: true },
  });
  if (!bom) return null;

  const [revisions, items, routings, workOrders] = await Promise.all([
    db.bOM.findMany({
      where: { tenantId, productId: bom.productId },
      select: {
        id: true,
        version: true,
        isActive: true,
        effectiveFrom: true,
        effectiveTo: true,
        _count: { select: { items: true, routings: true, workOrders: true } },
      },
      orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
    }),
    db.bOMItem.findMany({
      where: { tenantId, bomId },
      select: {
        id: true,
        quantity: true,
        unit: true,
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            categoryId: true,
            unitId: true,
            purchasePrice: true,
            averageCost: true,
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    }),
    db.routingOperation.findMany({
      where: { tenantId, bomId },
      select: {
        id: true,
        name: true,
        stepOrder: true,
        setupTime: true,
        runTime: true,
        workCenter: { select: { id: true, code: true, name: true, laborRate: true, overheadRate: true } },
      },
      orderBy: { stepOrder: 'asc' },
    }),
    db.workOrder.findMany({
      where: { tenantId, bomId, deletedAt: null },
      select: {
        id: true,
        number: true,
        status: true,
        plannedQty: true,
        producedQty: true,
        estimatedMaterialCost: true,
        estimatedLaborCost: true,
        estimatedOverheadCost: true,
        actualMaterialCost: true,
        actualLaborCost: true,
        actualOverheadCost: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
  ]);

  const alternativeMaterials = await buildAlternativeMaterials(db, tenantId, items);
  const operationRoutes = routings.map((routing): OperationRouteRow => ({
    routingId: routing.id,
    stepOrder: routing.stepOrder,
    operationName: routing.name,
    workCenter: { id: routing.workCenter.id, code: routing.workCenter.code, name: routing.workCenter.name },
    setupMinutes: round(numeric(routing.setupTime)),
    runMinutesPerUnit: round(numeric(routing.runTime)),
    laborRate: round(numeric(routing.workCenter.laborRate)),
    overheadRate: round(numeric(routing.workCenter.overheadRate)),
    plannedCostPerUnit: plannedRoutingCostPerUnit(routing),
  }));
  const costComparison = workOrders.map(buildCostRow);
  const plannedCostTotal = costComparison.reduce((sum, row) => sum + row.plannedCost, 0);
  const actualCostTotal = costComparison.reduce((sum, row) => sum + row.actualCost, 0);

  const now = new Date();
  const revisionRows = revisions.map((row): BomRevisionRow => ({
    id: row.id,
    version: row.version,
    isActive: row.isActive,
    effectiveFrom: toIso(row.effectiveFrom),
    effectiveTo: toIso(row.effectiveTo),
    itemCount: row._count.items,
    routingCount: row._count.routings,
    workOrderCount: row._count.workOrders,
    status: revisionStatus(row, now),
  }));

  return {
    bomId,
    generatedAt: new Date().toISOString(),
    summary: {
      revisionCount: revisionRows.length,
      activeRevisionCount: revisionRows.filter((row) => row.status === 'active').length,
      alternativeSuggestionCount: alternativeMaterials.reduce((sum, row) => sum + row.alternatives.length, 0),
      routeStepCount: operationRoutes.length,
      plannedCostTotal: round(plannedCostTotal),
      actualCostTotal: round(actualCostTotal),
      variancePct: pct(actualCostTotal - plannedCostTotal, plannedCostTotal),
    },
    revisions: revisionRows,
    alternativeMaterials,
    operationRoutes,
    costComparison,
  };
}

async function buildAlternativeMaterials(
  db: ProductionEngineeringDbClient,
  tenantId: string,
  items: BomItemLookup[],
): Promise<AlternativeMaterialRow[]> {
  const rows: AlternativeMaterialRow[] = [];

  for (const item of items) {
    if (!item.product.categoryId) {
      rows.push({
        bomItemId: item.id,
        primaryProduct: productRef(item.product),
        requiredQty: round(numeric(item.quantity), 3),
        unit: item.unit ?? 'AD',
        primaryUnitCost: round(unitCost(item.product)),
        alternatives: [],
      });
      continue;
    }

    const candidates = await db.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        categoryId: item.product.categoryId,
        unitId: item.product.unitId,
        id: { not: item.product.id },
      },
      select: {
        id: true,
        code: true,
        name: true,
        categoryId: true,
        unitId: true,
        purchasePrice: true,
        averageCost: true,
        stockLevels: { select: { quantity: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    const primaryCost = unitCost(item.product);
    rows.push({
      bomItemId: item.id,
      primaryProduct: productRef(item.product),
      requiredQty: round(numeric(item.quantity), 3),
      unit: item.unit ?? 'AD',
      primaryUnitCost: round(primaryCost),
      alternatives: candidates.slice(0, 3).map((candidate) => {
        const candidateCost = unitCost(candidate);
        const availableQty = candidate.stockLevels.reduce((sum, level) => sum + numeric(level.quantity), 0);
        return {
          product: { id: candidate.id, code: candidate.code, name: candidate.name },
          availableQty: round(availableQty, 3),
          unitCost: round(candidateCost),
          costDeltaPct: primaryCost > 0 ? pct(candidateCost - primaryCost, primaryCost) : 0,
          reason: availableQty > 0 ? 'Ayni kategori ve birimde stoklu alternatif' : 'Ayni kategori ve birimde alternatif',
        };
      }),
    });
  }

  return rows;
}
