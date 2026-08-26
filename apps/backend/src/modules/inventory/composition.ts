import { prisma } from '../../lib/prisma.js';
import { StockLevelQueries } from './application/queries/stock-level.queries.js';
import { PrismaStockLevelReadRepository } from './infrastructure/persistence/prisma-stock-level-read.repository.js';

const stockLevelReadRepository = new PrismaStockLevelReadRepository(prisma);

export const inventoryApplication = {
  stockLevelQueries: new StockLevelQueries(stockLevelReadRepository),
} as const;
