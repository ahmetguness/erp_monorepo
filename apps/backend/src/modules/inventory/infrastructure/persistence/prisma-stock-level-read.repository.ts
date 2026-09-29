import { Prisma, type PrismaClient } from '@prisma/client';
import type { StockLevelFilters, StockLevelReadRepository } from '../../application/ports/stock-level-read.repository.js';

const stockLevelInclude = Prisma.validator<Prisma.StockLevelInclude>()({
  product: {
    select: {
      id: true,
      code: true,
      name: true,
      barcode: true,
      minStockLevel: true,
      unit: { select: { code: true } },
    },
  },
  warehouse: { select: { id: true, name: true, code: true } },
  location: { select: { id: true, name: true, code: true } },
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
        ...(filters.locationId && { locationId: filters.locationId }),
      },
      include: stockLevelInclude,
      orderBy: [{ warehouse: { name: 'asc' } }, { product: { name: 'asc' } }],
    });

    // The stock-levels screen and its consumers work at warehouse granularity.
    // StockLevel is persisted per location, so expose a warehouse projection unless
    // the caller explicitly asks for one location. Comparing every bin separately
    // with the product minimum creates duplicate rows and false low-stock alerts.
    const projectedLevels = filters.locationId
      ? stockLevels
      : Array.from(
          stockLevels
            .reduce((groups, level) => {
              const key = `${level.productId}:${level.warehouseId}`;
              const current = groups.get(key);
              if (!current) {
                groups.set(key, {
                  ...level,
                  id: key,
                  quantity: new Prisma.Decimal(level.quantity),
                  locationId: '',
                  location: null,
                });
                return groups;
              }
              current.quantity = current.quantity.plus(level.quantity);
              if (level.updatedAt > current.updatedAt) current.updatedAt = level.updatedAt;
              return groups;
            }, new Map<string, StockLevelListRecord>())
            .values(),
        );

    return filters.belowMinimum
      ? projectedLevels.filter((level) => Number(level.quantity) < Number(level.product.minStockLevel))
      : projectedLevels;
  }
}
