import { Hono } from 'hono';
import { StockController } from '../controllers/stock.controller';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { MODULE_KEYS } from '../types/module.types';

const stockRoutes = new Hono();

stockRoutes.use('*', requireModule(MODULE_KEYS.INVENTORY));

stockRoutes.get('/levels', requirePermission('inventory', 'READ'), StockController.listStockLevels);
stockRoutes.get('/reorder-suggestions', requirePermission('inventory', 'READ'), StockController.listReorderSuggestions);
stockRoutes.get('/movements', requirePermission('inventory', 'READ'), StockController.listMovements);
stockRoutes.post('/movements', requirePermission('inventory', 'CREATE'), StockController.createManualMovement);
stockRoutes.get('/counts', requirePermission('inventory', 'READ'), StockController.listStockCounts);
stockRoutes.get('/counts/:id', requirePermission('inventory', 'READ'), StockController.getStockCount);
stockRoutes.post('/counts', requirePermission('inventory', 'CREATE'), StockController.createStockCount);
stockRoutes.post('/counts/:id/finalize', requirePermission('inventory', 'UPDATE'), StockController.finalizeStockCount);
stockRoutes.post('/reorder-suggestions/convert', requirePermission('inventory', 'CREATE'), StockController.convertSuggestionsToRequest);
stockRoutes.get('/valuation/reconciliation', requirePermission('inventory', 'READ'), StockController.getValuationReconciliation);

export { stockRoutes };
