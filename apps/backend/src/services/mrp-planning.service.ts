import { OrderStatus, PurchaseOrderStatus, PurchaseRequestStatus, WorkOrderStatus } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

type MrpDbClient = PrismaClient;

const OPEN_SALES_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.DRAFT,
  OrderStatus.CONFIRMED,
  OrderStatus.PARTIALLY_DELIVERED,
];

const OPEN_WORK_ORDER_STATUSES: readonly WorkOrderStatus[] = [
  WorkOrderStatus.PLANNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.PAUSED,
];

const OPEN_PURCHASE_ORDER_STATUSES: readonly PurchaseOrderStatus[] = [
  PurchaseOrderStatus.DRAFT,
  PurchaseOrderStatus.SENT,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
];

const OPEN_PURCHASE_REQUEST_STATUSES: readonly PurchaseRequestStatus[] = [
  PurchaseRequestStatus.DRAFT,
  PurchaseRequestStatus.PENDING_APPROVAL,
  PurchaseRequestStatus.APPROVED,
];

export interface MrpPlanningInput {
  tenantId: string;
  horizonDays: number;
}

export interface MrpProductRef {
  id: string;
  code: string;
  name: string;
}

export interface MrpProductionRecommendation {
  product: MrpProductRef;
  bom: {
    id: string;
    name: string;
    version: string;
  };
  demandQty: number;
  openSalesOrderQty: number;
  forecastDemandQty: number;
  safetyStockQty: number;
  stockQty: number;
  openWorkOrderQty: number;
  minOrderQty: number;
  leadTimeDays: number;
  suggestedOrderDate: string;
  expectedAvailabilityDate: string;
  recommendedQty: number;
  capacityHours: number;
  capacityAvailableHours: number;
  capacityGapHours: number;
}

export interface MrpPurchaseRecommendation {
  product: MrpProductRef;
  source: 'finished_good_without_bom' | 'bom_component';
  parentProduct?: MrpProductRef;
  grossRequirementQty: number;
  safetyStockQty: number;
  stockQty: number;
  openPurchaseQty: number;
  minOrderQty: number;
  leadTimeDays: number;
  suggestedOrderDate: string;
  expectedReceiptDate: string;
  recommendedQty: number;
}

export interface MrpCapacityRecommendation {
  workCenter: MrpProductRef;
  requiredHours: number;
  availableHours: number;
  allocatedHours: number;
  gapHours: number;
}

export interface MrpPlanningSummary {
  horizonDays: number;
  demandProducts: number;
  openSalesOrderQty: number;
  forecastDemandQty: number;
  safetyStockQty: number;
  openPurchaseQty: number;
  productionRecommendationCount: number;
  purchaseRecommendationCount: number;
  capacityGapCount: number;
}

export interface MrpPlanningResult {
  summary: MrpPlanningSummary;
  productionRecommendations: MrpProductionRecommendation[];
  purchaseRecommendations: MrpPurchaseRecommendation[];
  capacityRecommendations: MrpCapacityRecommendation[];
}

interface ProductLookup {
  id: string;
  code: string;
  name: string;
  minStockLevel: unknown;
}

interface WorkCenterLookup {
  id: string;
  code: string;
  name: string;
  capacity: unknown;
}

interface BomLookup {
  id: string;
  productId: string;
  name: string;
  version: string;
  items: Array<{
    productId: string;
    quantity: unknown;
    product: ProductLookup;
  }>;
  routings: Array<{
    workCenterId: string;
    setupTime: unknown;
    runTime: unknown;
    workCenter: WorkCenterLookup;
  }>;
}

function addToMap(map: Map<string, number>, key: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) return;
  map.set(key, (map.get(key) ?? 0) + value);
}

function decimalToNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function workCenterDailyCapacity(value: unknown): number {
  const parsed = decimalToNumber(value);
  return parsed > 0 ? parsed : 8;
}

function productRef(value: { id: string; code: string; name: string }): MrpProductRef {
  return { id: value.id, code: value.code, name: value.name };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function roundUpToLot(quantity: number, minOrderQty: number): number {
  if (quantity <= 0) return 0;
  if (minOrderQty <= 1) return roundQty(quantity);
  return roundQty(Math.ceil(quantity / minOrderQty) * minOrderQty);
}

function safetyStockQty(product: ProductLookup): number {
  return Math.max(0, decimalToNumber(product.minStockLevel));
}

function minOrderQty(product: ProductLookup, forecastQty: number): number {
  const safetyStock = safetyStockQty(product);
  const policyQty = Math.max(safetyStock * 0.5, forecastQty * 0.25, 1);
  return roundQty(policyQty);
}

function getPlanningWindow(horizonDays: number): { start: Date; end: Date } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + horizonDays);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

async function getStockByProduct(db: MrpDbClient, tenantId: string): Promise<Map<string, number>> {
  const rows = await db.stockLevel.groupBy({
    by: ['productId'],
    where: { tenantId },
    _sum: { quantity: true },
  });
  return new Map(rows.map((row) => [row.productId, decimalToNumber(row._sum.quantity)]));
}

async function getSalesDemandByProduct(
  db: MrpDbClient,
  tenantId: string,
  endDate: Date,
): Promise<Map<string, number>> {
  const orders = await db.salesOrder.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: { in: [...OPEN_SALES_ORDER_STATUSES] },
      OR: [{ dueDate: null }, { dueDate: { lte: endDate } }],
    },
    select: {
      items: {
        select: {
          productId: true,
          quantity: true,
          delivered: true,
        },
      },
    },
  });

  const demand = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items) {
      addToMap(demand, item.productId, Math.max(0, decimalToNumber(item.quantity) - decimalToNumber(item.delivered)));
    }
  }
  return demand;
}

async function getHistoricalForecastByProduct(
  db: MrpDbClient,
  tenantId: string,
  horizonDays: number,
): Promise<Map<string, number>> {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(30, Math.min(180, horizonDays * 3)));
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));

  const orders = await db.salesOrder.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: { in: [OrderStatus.CONFIRMED, OrderStatus.PARTIALLY_DELIVERED, OrderStatus.DELIVERED] },
      date: { gte: start, lt: end },
    },
    select: {
      items: { select: { productId: true, quantity: true } },
    },
  });

  const historical = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items) {
      addToMap(historical, item.productId, decimalToNumber(item.quantity));
    }
  }

  const forecast = new Map<string, number>();
  for (const [productId, quantity] of historical.entries()) {
    addToMap(forecast, productId, (quantity / days) * horizonDays);
  }
  return forecast;
}

async function getOpenWorkOrderSupplyByProduct(
  db: MrpDbClient,
  tenantId: string,
  endDate: Date,
): Promise<Map<string, number>> {
  const workOrders = await db.workOrder.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: { in: [...OPEN_WORK_ORDER_STATUSES] },
      OR: [{ endDate: null }, { endDate: { lte: endDate } }],
    },
    select: {
      productId: true,
      plannedQty: true,
      producedQty: true,
    },
  });

  const supply = new Map<string, number>();
  for (const workOrder of workOrders) {
    addToMap(
      supply,
      workOrder.productId,
      Math.max(0, decimalToNumber(workOrder.plannedQty) - decimalToNumber(workOrder.producedQty)),
    );
  }
  return supply;
}

async function getOpenPurchaseSupplyByProduct(db: MrpDbClient, tenantId: string): Promise<Map<string, number>> {
  const [purchaseOrders, purchaseRequests] = await Promise.all([
    db.purchaseOrder.findMany({
      where: { tenantId, deletedAt: null, status: { in: [...OPEN_PURCHASE_ORDER_STATUSES] } },
      select: {
        items: {
          select: {
            productId: true,
            quantity: true,
            received: true,
          },
        },
      },
    }),
    db.purchaseRequest.findMany({
      where: { tenantId, deletedAt: null, status: { in: [...OPEN_PURCHASE_REQUEST_STATUSES] } },
      select: {
        items: {
          select: {
            productId: true,
            quantity: true,
          },
        },
      },
    }),
  ]);

  const supply = new Map<string, number>();
  for (const order of purchaseOrders) {
    for (const item of order.items) {
      addToMap(supply, item.productId, Math.max(0, decimalToNumber(item.quantity) - decimalToNumber(item.received)));
    }
  }
  for (const request of purchaseRequests) {
    for (const item of request.items) {
      addToMap(supply, item.productId, decimalToNumber(item.quantity));
    }
  }
  return supply;
}

async function getLeadTimeDaysByProduct(db: MrpDbClient, tenantId: string): Promise<Map<string, number>> {
  const orders = await db.purchaseOrder.findMany({
    where: {
      tenantId,
      deletedAt: null,
      dueDate: { not: null },
      status: { in: [PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIALLY_RECEIVED, PurchaseOrderStatus.RECEIVED] },
    },
    select: {
      date: true,
      dueDate: true,
      items: { select: { productId: true } },
    },
    orderBy: { date: 'desc' },
    take: 200,
  });

  const buckets = new Map<string, { totalDays: number; count: number }>();
  for (const order of orders) {
    if (!order.dueDate) continue;
    const leadTimeDays = Math.max(1, Math.ceil((order.dueDate.getTime() - order.date.getTime()) / 86_400_000));
    for (const item of order.items) {
      const current = buckets.get(item.productId) ?? { totalDays: 0, count: 0 };
      current.totalDays += leadTimeDays;
      current.count += 1;
      buckets.set(item.productId, current);
    }
  }

  const result = new Map<string, number>();
  for (const [productId, bucket] of buckets.entries()) {
    result.set(productId, Math.max(1, Math.round(bucket.totalDays / Math.max(bucket.count, 1))));
  }
  return result;
}

async function getActiveBomByProduct(db: MrpDbClient, tenantId: string): Promise<Map<string, BomLookup>> {
  const now = new Date();
  const boms = await db.bOM.findMany({
    where: {
      tenantId,
      isActive: true,
      OR: [
        { effectiveFrom: null },
        { effectiveFrom: { lte: now } },
      ],
      AND: [
        {
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: now } },
          ],
        },
      ],
    },
    select: {
      id: true,
      productId: true,
      name: true,
      version: true,
      items: {
        select: {
          productId: true,
          quantity: true,
          product: { select: { id: true, code: true, name: true, minStockLevel: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
      routings: {
        select: {
          workCenterId: true,
          setupTime: true,
          runTime: true,
          workCenter: { select: { id: true, code: true, name: true, capacity: true } },
        },
        orderBy: { stepOrder: 'asc' },
      },
    },
    orderBy: [{ productId: 'asc' }, { effectiveFrom: 'desc' }, { updatedAt: 'desc' }],
  });

  const byProduct = new Map<string, BomLookup>();
  for (const bom of boms) {
    if (!byProduct.has(bom.productId)) byProduct.set(bom.productId, bom);
  }
  return byProduct;
}

async function getProductsByIds(
  db: MrpDbClient,
  tenantId: string,
  productIds: Iterable<string>,
): Promise<Map<string, ProductLookup>> {
  const ids = Array.from(new Set(productIds));
  if (ids.length === 0) return new Map();
  const products = await db.product.findMany({
    where: { tenantId, id: { in: ids }, deletedAt: null },
    select: { id: true, code: true, name: true, minStockLevel: true },
  });
  return new Map(products.map((product) => [product.id, product]));
}

async function getCapacityByWorkCenter(
  db: MrpDbClient,
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<Map<string, { availableHours: number; allocatedHours: number; plannedDays: number }>> {
  const rows = await db.workCenterCapacity.groupBy({
    by: ['workCenterId'],
    where: { tenantId, date: { gte: startDate, lte: endDate } },
    _sum: { capacity: true, allocated: true },
    _count: { _all: true },
  });

  return new Map(rows.map((row) => [
    row.workCenterId,
    {
      availableHours: decimalToNumber(row._sum.capacity),
      allocatedHours: decimalToNumber(row._sum.allocated),
      plannedDays: row._count._all,
    },
  ]));
}

function availableCapacityForWindow(
  capacity: { availableHours: number; allocatedHours: number; plannedDays: number } | undefined,
  dailyCapacity: number,
  horizonDays: number,
): number {
  const calendarAvailableHours = capacity?.availableHours ?? 0;
  const allocatedHours = capacity?.allocatedHours ?? 0;
  const missingCalendarDays = Math.max(0, horizonDays - (capacity?.plannedDays ?? 0));
  return Math.max(0, calendarAvailableHours + (dailyCapacity * missingCalendarDays) - allocatedHours);
}

interface MaterialRequirementAccumulator {
  productId: string;
  quantity: number;
  parentProductIds: Set<string>;
}

function collectMaterialRequirement(
  materialRequirements: Map<string, MaterialRequirementAccumulator>,
  parentProductId: string,
  productId: string,
  quantity: number,
): void {
  const current = materialRequirements.get(productId);
  if (current) {
    current.quantity += quantity;
    current.parentProductIds.add(parentProductId);
  } else {
    materialRequirements.set(productId, { productId, quantity, parentProductIds: new Set([parentProductId]) });
  }
}

export async function getMrpPlanning(
  db: MrpDbClient,
  input: MrpPlanningInput,
): Promise<MrpPlanningResult> {
  const { tenantId, horizonDays } = input;
  const { start, end } = getPlanningWindow(horizonDays);

  const [
    stockByProduct,
    salesDemandByProduct,
    forecastDemandByProduct,
    openWorkOrderSupplyByProduct,
    openPurchaseSupplyByProduct,
    leadTimeDaysByProduct,
    bomByProduct,
    capacityByWorkCenter,
  ] = await Promise.all([
    getStockByProduct(db, tenantId),
    getSalesDemandByProduct(db, tenantId, end),
    getHistoricalForecastByProduct(db, tenantId, horizonDays),
    getOpenWorkOrderSupplyByProduct(db, tenantId, end),
    getOpenPurchaseSupplyByProduct(db, tenantId),
    getLeadTimeDaysByProduct(db, tenantId),
    getActiveBomByProduct(db, tenantId),
    getCapacityByWorkCenter(db, tenantId, start, end),
  ]);

  const demandProductIds = new Set([...salesDemandByProduct.keys(), ...forecastDemandByProduct.keys()]);
  const products = await getProductsByIds(db, tenantId, demandProductIds);
  const productionRecommendations: MrpProductionRecommendation[] = [];
  const purchaseRecommendations: MrpPurchaseRecommendation[] = [];
  const materialRequirements = new Map<string, MaterialRequirementAccumulator>();
  const requiredCapacityByWorkCenter = new Map<string, number>();
  const workCenterRefs = new Map<string, WorkCenterLookup>();

  for (const productId of demandProductIds) {
    const product = products.get(productId);
    if (!product) continue;
    const openSalesOrderQty = salesDemandByProduct.get(productId) ?? 0;
    const forecastDemandQty = forecastDemandByProduct.get(productId) ?? 0;
    const productSafetyStockQty = safetyStockQty(product);
    const demandQty = openSalesOrderQty + forecastDemandQty + productSafetyStockQty;
    const stockQty = stockByProduct.get(productId) ?? 0;
    const openWorkOrderQty = openWorkOrderSupplyByProduct.get(productId) ?? 0;
    const productMinOrderQty = minOrderQty(product, forecastDemandQty);
    const leadTimeDays = leadTimeDaysByProduct.get(productId) ?? 7;
    const suggestedOrderDate = dateOnly(new Date());
    const expectedAvailabilityDate = dateOnly(addDays(new Date(), leadTimeDays));
    const recommendedQty = roundUpToLot(Math.max(0, demandQty - stockQty - openWorkOrderQty), productMinOrderQty);
    if (recommendedQty <= 0) continue;

    const bom = bomByProduct.get(productId);
    if (!bom) {
      const openPurchaseQty = openPurchaseSupplyByProduct.get(productId) ?? 0;
      const purchaseQty = roundUpToLot(Math.max(0, recommendedQty - openPurchaseQty), productMinOrderQty);
      if (purchaseQty <= 0) continue;
      purchaseRecommendations.push({
        product: productRef(product),
        source: 'finished_good_without_bom',
        grossRequirementQty: roundQty(demandQty),
        safetyStockQty: roundQty(productSafetyStockQty),
        stockQty: roundQty(stockQty),
        openPurchaseQty: roundQty(openPurchaseQty),
        minOrderQty: productMinOrderQty,
        leadTimeDays,
        suggestedOrderDate,
        expectedReceiptDate: expectedAvailabilityDate,
        recommendedQty: roundQty(purchaseQty),
      });
      continue;
    }

    let requiredCapacityHours = 0;
    let availableCapacityHours = 0;
    for (const routing of bom.routings) {
      const setupHours = decimalToNumber(routing.setupTime) / 60;
      const runHours = (decimalToNumber(routing.runTime) * recommendedQty) / 60;
      const requiredHours = setupHours + runHours;
      requiredCapacityHours += requiredHours;
      addToMap(requiredCapacityByWorkCenter, routing.workCenterId, requiredHours);
      workCenterRefs.set(routing.workCenterId, routing.workCenter);
      const capacity = capacityByWorkCenter.get(routing.workCenterId);
      availableCapacityHours += availableCapacityForWindow(
        capacity,
        workCenterDailyCapacity(routing.workCenter.capacity),
        horizonDays,
      );
    }

    for (const item of bom.items) {
      collectMaterialRequirement(
        materialRequirements,
        productId,
        item.productId,
        decimalToNumber(item.quantity) * recommendedQty,
      );
    }

    productionRecommendations.push({
      product: productRef(product),
      bom: { id: bom.id, name: bom.name, version: bom.version },
      demandQty: roundQty(demandQty),
      openSalesOrderQty: roundQty(openSalesOrderQty),
      forecastDemandQty: roundQty(forecastDemandQty),
      safetyStockQty: roundQty(productSafetyStockQty),
      stockQty: roundQty(stockQty),
      openWorkOrderQty: roundQty(openWorkOrderQty),
      minOrderQty: productMinOrderQty,
      leadTimeDays,
      suggestedOrderDate,
      expectedAvailabilityDate,
      recommendedQty: roundQty(recommendedQty),
      capacityHours: roundQty(requiredCapacityHours),
      capacityAvailableHours: roundQty(availableCapacityHours),
      capacityGapHours: roundQty(Math.max(0, requiredCapacityHours - availableCapacityHours)),
    });
  }

  const componentProducts = await getProductsByIds(db, tenantId, Array.from(materialRequirements.values()).map((row) => row.productId));
  for (const row of materialRequirements.values()) {
    const product = componentProducts.get(row.productId);
    const parentProductId = row.parentProductIds.size === 1 ? Array.from(row.parentProductIds)[0] : undefined;
    const parentProduct = parentProductId ? products.get(parentProductId) : undefined;
    if (!product) continue;
    const componentSafetyStockQty = safetyStockQty(product);
    const grossRequirementQty = row.quantity + componentSafetyStockQty;
    const stockQty = stockByProduct.get(row.productId) ?? 0;
    const openPurchaseQty = openPurchaseSupplyByProduct.get(row.productId) ?? 0;
    const leadTimeDays = leadTimeDaysByProduct.get(row.productId) ?? 7;
    const componentMinOrderQty = minOrderQty(product, 0);
    const recommendedQty = roundUpToLot(Math.max(0, grossRequirementQty - stockQty - openPurchaseQty), componentMinOrderQty);
    if (recommendedQty <= 0) continue;
    purchaseRecommendations.push({
      product: productRef(product),
      source: 'bom_component',
      ...(parentProduct ? { parentProduct: productRef(parentProduct) } : {}),
      grossRequirementQty: roundQty(grossRequirementQty),
      safetyStockQty: roundQty(componentSafetyStockQty),
      stockQty: roundQty(stockQty),
      openPurchaseQty: roundQty(openPurchaseQty),
      minOrderQty: componentMinOrderQty,
      leadTimeDays,
      suggestedOrderDate: dateOnly(new Date()),
      expectedReceiptDate: dateOnly(addDays(new Date(), leadTimeDays)),
      recommendedQty: roundQty(recommendedQty),
    });
  }

  const capacityRecommendations: MrpCapacityRecommendation[] = [];
  for (const [workCenterId, requiredHours] of requiredCapacityByWorkCenter.entries()) {
    const ref = workCenterRefs.get(workCenterId);
    if (!ref) continue;
    const capacity = capacityByWorkCenter.get(workCenterId);
    const availableHours = (capacity?.availableHours ?? 0)
      + (workCenterDailyCapacity(ref.capacity) * Math.max(0, horizonDays - (capacity?.plannedDays ?? 0)));
    const allocatedHours = capacity?.allocatedHours ?? 0;
    const freeHours = Math.max(0, availableHours - allocatedHours);
    const gapHours = Math.max(0, requiredHours - freeHours);
    if (gapHours <= 0) continue;
    capacityRecommendations.push({
      workCenter: productRef(ref),
      requiredHours: roundQty(requiredHours),
      availableHours: roundQty(availableHours),
      allocatedHours: roundQty(allocatedHours),
      gapHours: roundQty(gapHours),
    });
  }

  return {
    summary: {
      horizonDays,
      demandProducts: demandProductIds.size,
      openSalesOrderQty: roundQty([...salesDemandByProduct.values()].reduce((sum, value) => sum + value, 0)),
      forecastDemandQty: roundQty([...forecastDemandByProduct.values()].reduce((sum, value) => sum + value, 0)),
      safetyStockQty: roundQty([...products.values()].reduce((sum, product) => sum + safetyStockQty(product), 0)),
      openPurchaseQty: roundQty([...openPurchaseSupplyByProduct.values()].reduce((sum, value) => sum + value, 0)),
      productionRecommendationCount: productionRecommendations.length,
      purchaseRecommendationCount: purchaseRecommendations.length,
      capacityGapCount: capacityRecommendations.length,
    },
    productionRecommendations,
    purchaseRecommendations,
    capacityRecommendations,
  };
}
