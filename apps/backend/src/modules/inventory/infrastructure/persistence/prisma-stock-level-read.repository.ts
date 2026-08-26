import { Prisma, type PrismaClient } from '@prisma/client';
import type { StockLevelFilters, StockLevelReadRepository } from '../../application/ports/stock-level-read.repository.js';

const stockLevelInclude = Prisma.validator<Prisma.StockLevelInclude>()({
  product: {
    select: {
      id: true,
      code: true,
      name: true,
      minStockLevel: true,
      unit: { select: { code: true } },
    },
  },
  warehouse: { select: { id: true, name: true, code: true } },
});

export type StockLevelListRecord = Prisma.StockLevelGetPayload<{ include: typeof stockLevelInclude }>;

export class PrismaStockLevelReadRepository implements StockLevelReadRepository<StockLevelListRecord> {
  constructor(private readonly db: PrismaClient) {}

  async list(tenantId: string, filters: StockLevelFilters): Promise<StockLevelListRecord[]> {
    const stockLevels = await this.db.stockLevel.findMany({
      where: {
        tenantId,
        ...(filters.warehouseId && { warehouseId: filters.warehouseId }),
        ...(filters.productId && { productId: filters.productId }),
      },
      include: stockLevelInclude,
      orderBy: [{ warehouse: { name: 'asc' } }, { product: { name: 'asc' } }],
    });
    return filters.belowMinimum
      ? stockLevels.filter((level) => Number(level.quantity) < Number(level.product.minStockLevel))
      : stockLevels;
  }
}
