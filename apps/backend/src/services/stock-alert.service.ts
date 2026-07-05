import { MovementType, PrismaClient } from '@prisma/client';

export interface StockAlertItem {
  productId: string;
  productCode: string;
  productName: string;
  unitCode: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  currentQuantity: number;
  minStockLevel: number;
  shortageQuantity: number;
  dailySalesVelocity: number;
  estimatedDaysToStockout: number | null;
  reorderSuggestedQuantity: number;
  reorderReason: 'MIN_STOCK' | 'RUNNING_OUT' | 'OUT_OF_STOCK';
  severity: 'OUT_OF_STOCK' | 'LOW' | 'RUNNING_OUT';
  href: string;
}

export interface StockAlertSummary {
  alertCount: number;
  outOfStockCount: number;
  lowStockCount: number;
  runningOutCount: number;
  reorderSuggestionCount: number;
  checkedProductCount: number;
  singleWarehouse: boolean;
  warehouseName: string | null;
}

export interface StockAlertDashboard {
  summary: StockAlertSummary;
  items: StockAlertItem[];
}

export class StockAlertService {
  constructor(private readonly prisma: PrismaClient) {}

  async dashboard(tenantId: string, limit = 8): Promise<StockAlertDashboard> {
    const warehouses = await this.prisma.warehouse.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 2,
    });
    const singleWarehouse = warehouses.length <= 1;
    const singleWarehouseId = warehouses.length === 1 ? warehouses[0].id : null;
    const singleWarehouseName = warehouses.length === 1 ? warehouses[0].name : null;

    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        minStockLevel: { gt: 0 },
      },
      select: {
        id: true,
        code: true,
        name: true,
        minStockLevel: true,
        unit: { select: { code: true } },
        stockLevels: {
          select: {
            quantity: true,
            warehouseId: true,
            warehouse: { select: { id: true, name: true } },
          },
          ...(singleWarehouseId ? { where: { warehouseId: singleWarehouseId } } : {}),
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    const productIds = products.map((product) => product.id);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const movementGroups = productIds.length > 0
      ? await this.prisma.stockMovement.groupBy({
          by: ['productId'],
          where: {
            tenantId,
            productId: { in: productIds },
            type: MovementType.OUT,
            createdAt: { gte: thirtyDaysAgo },
            ...(singleWarehouseId ? { fromWarehouseId: singleWarehouseId } : {}),
          },
          _sum: { quantity: true },
        })
      : [];
    const quantityOutByProduct = new Map(
      movementGroups.map((group) => [group.productId, Number(group._sum.quantity ?? 0)]),
    );

    const alerts = products
      .map((product): StockAlertItem | null => {
        const currentQuantity = product.stockLevels.reduce((total, level) => total + Number(level.quantity), 0);
        const minStockLevel = Number(product.minStockLevel);
        const quantityOut30 = quantityOutByProduct.get(product.id) ?? 0;
        const dailySalesVelocity = quantityOut30 / 30;
        const estimatedDaysToStockout = dailySalesVelocity > 0
          ? Math.max(0, Math.floor(currentQuantity / dailySalesVelocity))
          : null;
        const isOutOfStock = currentQuantity <= 0;
        const isBelowMin = currentQuantity <= minStockLevel;
        const isRunningOut = !isBelowMin && estimatedDaysToStockout !== null && estimatedDaysToStockout <= 14;
        if (!isBelowMin && !isRunningOut) return null;

        const shortageQuantity = Math.max(0, minStockLevel - currentQuantity);
        const velocityTargetQuantity = dailySalesVelocity > 0
          ? Math.max(0, Math.ceil((dailySalesVelocity * 30) - currentQuantity))
          : 0;
        const reorderSuggestedQuantity = Math.max(shortageQuantity, velocityTargetQuantity);
        const warehouse = singleWarehouse
          ? product.stockLevels[0]?.warehouse ?? (singleWarehouseId ? { id: singleWarehouseId, name: singleWarehouseName ?? 'Depo' } : null)
          : null;

        return {
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          unitCode: product.unit?.code ?? null,
          warehouseId: warehouse?.id ?? null,
          warehouseName: warehouse?.name ?? null,
          currentQuantity,
          minStockLevel,
          shortageQuantity,
          dailySalesVelocity,
          estimatedDaysToStockout,
          reorderSuggestedQuantity,
          reorderReason: isOutOfStock ? 'OUT_OF_STOCK' : isRunningOut ? 'RUNNING_OUT' : 'MIN_STOCK',
          severity: isOutOfStock ? 'OUT_OF_STOCK' : isRunningOut ? 'RUNNING_OUT' : 'LOW',
          href: `/dashboard/products/${product.id}`,
        };
      })
      .filter((item): item is StockAlertItem => item !== null)
      .sort((left, right) => {
        const severityOrder: Record<StockAlertItem['severity'], number> = {
          OUT_OF_STOCK: 0,
          RUNNING_OUT: 1,
          LOW: 2,
        };
        if (left.severity !== right.severity) return severityOrder[left.severity] - severityOrder[right.severity];
        const leftDays = left.estimatedDaysToStockout ?? Infinity;
        const rightDays = right.estimatedDaysToStockout ?? Infinity;
        if (leftDays !== rightDays) return leftDays - rightDays;
        return right.shortageQuantity - left.shortageQuantity;
      });

    return {
      summary: {
        alertCount: alerts.length,
        outOfStockCount: alerts.filter((item) => item.severity === 'OUT_OF_STOCK').length,
        lowStockCount: alerts.filter((item) => item.severity === 'LOW').length,
        runningOutCount: alerts.filter((item) => item.severity === 'RUNNING_OUT').length,
        reorderSuggestionCount: alerts.filter((item) => item.reorderSuggestedQuantity > 0).length,
        checkedProductCount: products.length,
        singleWarehouse,
        warehouseName: singleWarehouseName,
      },
      items: alerts.slice(0, Math.max(1, Math.min(25, limit))),
    };
  }
}
