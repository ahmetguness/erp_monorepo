import { Hono } from 'hono';
import { MarketplacePricingController } from '../modules/marketplace/http/controllers/index.js';

const marketplacePricingRoutes = new Hono();

marketplacePricingRoutes.get('/repricing-analysis', MarketplacePricingController.getRepricingAnalysis);
marketplacePricingRoutes.post('/execute-reprice', MarketplacePricingController.executeReprice);
marketplacePricingRoutes.get('/stock-allocations', MarketplacePricingController.getStockAllocations);
marketplacePricingRoutes.post('/reallocate-stock', MarketplacePricingController.reallocateStock);
marketplacePricingRoutes.post('/run-batch-scan', MarketplacePricingController.runBatchScan);

export { marketplacePricingRoutes };
