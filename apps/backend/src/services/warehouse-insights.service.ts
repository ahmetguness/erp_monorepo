import { ApprovalModule, ApprovalStatus, EntityType, type Prisma, type PrismaClient } from '@prisma/client';

export interface WarehouseLocationInsight {
  id: string;
  code: string;
  name: string;
  stockItemCount: number;
  totalQuantity: number;
  totalValue: number;
}

export interface WarehouseApprovalInsight {
  transferApprovalConfigured: boolean;
  activeTransferFlowCount: number;
  pendingTransferApprovalCount: number;
}

export interface WarehouseInsight {
  warehouseId: string;
  locationCount: number;
  stockItemCount: number;
  totalQuantity: number;
  totalValue: number;
  unlocatedStockItemCount: number;
  locations: WarehouseLocationInsight[];
  approval: WarehouseApprovalInsight;
}

interface StockLevelForInsight {
  warehouseId: string;
  locationId: string;
  quantity: Prisma.Decimal | number;
  product: {
    averageCost: Prisma.Decimal | number | null;
    purchasePrice: Prisma.Decimal | number | null;
  };
}

interface LocationForInsight {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
}

function numberValue(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}

function stockLevelValue(level: StockLevelForInsight): number {
  const cost = numberValue(level.product.averageCost) > 0
    ? numberValue(level.product.averageCost)
    : numberValue(level.product.purchasePrice);
  return numberValue(level.quantity) * cost;
}

function emptyApprovalInsight(): WarehouseApprovalInsight {
  return {
    transferApprovalConfigured: false,
    activeTransferFlowCount: 0,
    pendingTransferApprovalCount: 0,
  };
}

export class WarehouseInsightsService {
  constructor(private readonly db: PrismaClient) {}

  async getInsights(tenantId: string, warehouseIds: string[]): Promise<Map<string, WarehouseInsight>> {
    const insights = new Map<string, WarehouseInsight>();
    for (const warehouseId of warehouseIds) {
      insights.set(warehouseId, {
        warehouseId,
        locationCount: 0,
        stockItemCount: 0,
        totalQuantity: 0,
        totalValue: 0,
        unlocatedStockItemCount: 0,
        locations: [],
        approval: emptyApprovalInsight(),
      });
    }
    if (warehouseIds.length === 0) return insights;

    const [locations, stockLevels, activeTransferFlowCount, pendingTransferApprovalCount] = await this.db.$transaction([
      this.db.location.findMany({
        where: { tenantId, warehouseId: { in: warehouseIds }, isActive: true },
        select: { id: true, warehouseId: true, code: true, name: true },
        orderBy: [{ warehouseId: 'asc' }, { code: 'asc' }],
      }),
      this.db.stockLevel.findMany({
        where: { tenantId, warehouseId: { in: warehouseIds } },
        select: {
          warehouseId: true,
          locationId: true,
          quantity: true,
          product: { select: { averageCost: true, purchasePrice: true } },
        },
      }),
      this.db.approvalFlow.count({
        where: {
          tenantId,
          module: ApprovalModule.OTHER,
          isActive: true,
          name: { contains: 'transfer', mode: 'insensitive' },
        },
      }),
      this.db.approvalRequest.count({
        where: {
          tenantId,
          entityType: EntityType.OTHER,
          status: ApprovalStatus.PENDING,
          notes: { contains: 'transfer', mode: 'insensitive' },
        },
      }),
    ]);

    const locationsById = new Map(locations.map((location) => [location.id, location]));
    for (const location of locations) {
      const insight = insights.get(location.warehouseId);
      if (!insight) continue;
      insight.locationCount += 1;
      insight.locations.push({
        id: location.id,
        code: location.code,
        name: location.name,
        stockItemCount: 0,
        totalQuantity: 0,
        totalValue: 0,
      });
    }

    const locationInsightById = new Map<string, WarehouseLocationInsight>();
    for (const insight of insights.values()) {
      for (const location of insight.locations) locationInsightById.set(location.id, location);
    }

    for (const level of stockLevels) {
      const insight = insights.get(level.warehouseId);
      if (!insight) continue;
      const quantity = numberValue(level.quantity);
      const value = stockLevelValue(level);
      insight.stockItemCount += 1;
      insight.totalQuantity += quantity;
      insight.totalValue += value;
      if (!locationsById.has(level.locationId)) {
        insight.unlocatedStockItemCount += 1;
      }

      const locationInsight = locationInsightById.get(level.locationId);
      if (locationInsight) {
        locationInsight.stockItemCount += 1;
        locationInsight.totalQuantity += quantity;
        locationInsight.totalValue += value;
      }
    }

    for (const insight of insights.values()) {
      insight.totalValue = Math.round(insight.totalValue * 100) / 100;
      for (const location of insight.locations) {
        location.totalValue = Math.round(location.totalValue * 100) / 100;
      }
      insight.approval = {
        transferApprovalConfigured: activeTransferFlowCount > 0,
        activeTransferFlowCount,
        pendingTransferApprovalCount,
      };
    }

    return insights;
  }
}
