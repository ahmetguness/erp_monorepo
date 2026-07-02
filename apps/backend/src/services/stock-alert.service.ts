import { PrismaClient } from '@prisma/client';

export interface StockAlertItem {
  productId: string;
  productCode: string;
  productName: string;
  unitCode: string | null;
  currentQuantity: number;
  minStockLevel: number;
  shortageQuantity: number;
  severity: 'OUT_OF_STOCK' | 'LOW';
  href: string;
}

export interface StockAlertSummary {
  alertCount: number;
  outOfStockCount: number;
  lowStockCount: number;
  checkedProductCount: number;
}

export interface StockAlertDashboard {
  summary: StockAlertSummary;
  items: StockAlertItem[];
}

export class StockAlertService {
  constructor(private readonly prisma: PrismaClient) {}

  async dashboard(tenantId: string, limit = 8): Promise<StockAlertDashboard> {
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
        stockLevels: { select: { quantity: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    const alerts = products
      .map((product): StockAlertItem | null => {
        const currentQuantity = product.stockLevels.reduce((total, level) => total + Number(level.quantity), 0);
        const minStockLevel = Number(product.minStockLevel);
        if (currentQuantity > minStockLevel) return null;

        return {
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          unitCode: product.unit?.code ?? null,
          currentQuantity,
          minStockLevel,
          shortageQuantity: Math.max(0, minStockLevel - currentQuantity),
          severity: currentQuantity <= 0 ? 'OUT_OF_STOCK' : 'LOW',
          href: `/dashboard/products/${product.id}`,
        };
      })
      .filter((item): item is StockAlertItem => item !== null)
      .sort((left, right) => {
        if (left.severity !== right.severity) return left.severity === 'OUT_OF_STOCK' ? -1 : 1;
        return right.shortageQuantity - left.shortageQuantity;
      });

    return {
      summary: {
        alertCount: alerts.length,
        outOfStockCount: alerts.filter((item) => item.severity === 'OUT_OF_STOCK').length,
        lowStockCount: alerts.filter((item) => item.severity === 'LOW').length,
        checkedProductCount: products.length,
      },
      items: alerts.slice(0, Math.max(1, Math.min(25, limit))),
    };
  }
}
