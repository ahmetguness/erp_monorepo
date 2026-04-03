import { Hono } from 'hono';
import { StockController } from '../controllers/stock.controller';
import { requireModule } from '../middleware/requireModule';
import { MODULE_KEYS } from '../types/module.types';

const stockRoutes = new Hono();

stockRoutes.use('*', requireModule(MODULE_KEYS.INVENTORY));

// Stock Levels
stockRoutes.get('/levels', StockController.listStockLevels);

// Stock Movements
stockRoutes.get('/movements', StockController.listMovements);
stockRoutes.post('/movements', StockController.createManualMovement);

// Stock Counts
stockRoutes.get('/counts', StockController.listStockCounts);
stockRoutes.get('/counts/:id', StockController.getStockCount);
stockRoutes.post('/counts', StockController.createStockCount);
stockRoutes.post('/counts/:id/finalize', StockController.finalizeStockCount);

export { stockRoutes };
