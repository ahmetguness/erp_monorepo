import { prisma } from '../../lib/prisma.js';
import {
  ConfirmGoodsReceipt,
  RecordStockMovement,
  ReleaseReservation,
  ReserveStock,
} from './application/operations/index.js';
import { StockLevelQueries } from './application/queries/stock-level.queries.js';
import { PrismaStockLevelReadRepository } from './infrastructure/persistence/prisma-stock-level-read.repository.js';
import { PrismaInventoryOperationRepository } from './infrastructure/persistence/prisma-inventory-operation.repository.js';

const stockLevelReadRepository = new PrismaStockLevelReadRepository(prisma);
const inventoryOperationRepository = new PrismaInventoryOperationRepository(prisma);

export const inventoryApplication = {
  stockLevelQueries: new StockLevelQueries(stockLevelReadRepository),
  recordStockMovement: new RecordStockMovement(inventoryOperationRepository),
  reserveStock: new ReserveStock(inventoryOperationRepository),
  releaseReservation: new ReleaseReservation(inventoryOperationRepository),
  confirmGoodsReceipt: new ConfirmGoodsReceipt(inventoryOperationRepository),
} as const;
