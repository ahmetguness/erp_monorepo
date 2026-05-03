import { Hono } from 'hono';
import { FeatureKey } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requireFeature } from '../middleware/requireFeature';
import { requireModule } from '../middleware/requireModule';
import { MODULE_KEYS } from '../types/module.types';
import {
  MarketplaceIntegrationController,
  MarketplaceListingController,
  MarketplaceOrderController,
  TrendyolSyncController,
} from '../controllers/marketplace.controller';

const marketplaceRoutes = new Hono();

marketplaceRoutes.use('*', requirePlan('ENTERPRISE'));
marketplaceRoutes.use('*', requireFeature(FeatureKey.MARKETPLACE));
marketplaceRoutes.use('*', requireModule(MODULE_KEYS.MARKETPLACE));

// Entegrasyonlar
marketplaceRoutes.get('/integrations', MarketplaceIntegrationController.list);
marketplaceRoutes.get('/integrations/:id', MarketplaceIntegrationController.getById);
marketplaceRoutes.post('/integrations', MarketplaceIntegrationController.create);
marketplaceRoutes.patch('/integrations/:id', MarketplaceIntegrationController.update);
marketplaceRoutes.delete('/integrations/:id', MarketplaceIntegrationController.remove);

// Trendyol Sync (queue-based — returns 202 + jobId)
marketplaceRoutes.post('/integrations/:id/trendyol/test', TrendyolSyncController.testConnection);
marketplaceRoutes.post('/integrations/:id/trendyol/sync-orders', TrendyolSyncController.syncOrders);
marketplaceRoutes.post('/integrations/:id/trendyol/sync-stock', TrendyolSyncController.syncStock);
marketplaceRoutes.get('/integrations/:id/trendyol/jobs/:jobId', TrendyolSyncController.getJobStatus);
marketplaceRoutes.get('/integrations/:id/trendyol/batch/:batchRequestId', TrendyolSyncController.getBatchResult);

// Listlemeler
marketplaceRoutes.get('/listings', MarketplaceListingController.list);
marketplaceRoutes.post('/listings', MarketplaceListingController.create);
marketplaceRoutes.patch('/listings/:id', MarketplaceListingController.update);
marketplaceRoutes.delete('/listings/:id', MarketplaceListingController.remove);

// Siparişler
marketplaceRoutes.get('/orders', MarketplaceOrderController.list);
marketplaceRoutes.get('/orders/:id', MarketplaceOrderController.getById);
marketplaceRoutes.post('/orders/:id/status', MarketplaceOrderController.changeStatus);

export { marketplaceRoutes };
