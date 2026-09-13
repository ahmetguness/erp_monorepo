import { prisma } from '../../lib/prisma.js';
import { CreateManualStockMovement } from './application/operations/index.js';
import { StockLevelQueries } from './application/queries/stock-level.queries.js';
import { PrismaStockLevelReadRepository } from './infrastructure/persistence/prisma-stock-level-read.repository.js';
import { PrismaStockMovementWriteRepository } from './infrastructure/persistence/prisma-stock-movement-write.repository.js';

const stockLevelReadRepository = new PrismaStockLevelReadRepository(prisma);
const stockMovementWriteRepository = new PrismaStockMovementWriteRepository(prisma);

export const inventoryApplication = {
  stockLevelQueries: new StockLevelQueries(stockLevelReadRepository),
  createManualStockMovement: new CreateManualStockMovement(stockMovementWriteRepository),
} as const;
