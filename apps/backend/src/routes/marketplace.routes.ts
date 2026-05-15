import { Hono } from 'hono';
import { FeatureKey, Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requireFeature } from '../middleware/requireFeature';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { MODULE_KEYS } from '../types/module.types';
import {
  MarketplaceIntegrationController,
  MarketplaceListingController,
  MarketplaceOrderController,
  TrendyolSyncController,
  MarketplaceMonitoringController,
} from '../controllers/marketplace.controller';

const marketplaceRoutes = new Hono();

marketplaceRoutes.use('*', requirePlan(Plan.ENTERPRISE));
marketplaceRoutes.use('*', requireFeature(FeatureKey.MARKETPLACE));
marketplaceRoutes.use('*', requireModule(MODULE_KEYS.MARKETPLACE));

// Entegrasyonlar
marketplaceRoutes.get('/integrations', requirePermission('marketplace', 'READ'), MarketplaceIntegrationController.list);
marketplaceRoutes.get('/integrations/:id', requirePermission('marketplace', 'READ'), MarketplaceIntegrationController.getById);
marketplaceRoutes.post('/integrations', requirePermission('marketplace', 'CREATE'), MarketplaceIntegrationController.create);
marketplaceRoutes.patch('/integrations/:id', requirePermission('marketplace', 'UPDATE'), MarketplaceIntegrationController.update);
marketplaceRoutes.delete('/integrations/:id', requirePermission('marketplace', 'DELETE'), MarketplaceIntegrationController.remove);

// Trendyol Sync (queue-based — returns 202 + jobId)
marketplaceRoutes.post('/integrations/:id/trendyol/test', requirePermission('marketplace', 'READ'), TrendyolSyncController.testConnection);
marketplaceRoutes.post('/integrations/:id/trendyol/sync-orders', requirePermission('marketplace', 'UPDATE'), TrendyolSyncController.syncOrders);
marketplaceRoutes.post('/integrations/:id/trendyol/sync-stock', requirePermission('marketplace', 'UPDATE'), TrendyolSyncController.syncStock);
marketplaceRoutes.get('/integrations/:id/trendyol/jobs/:jobId', requirePermission('marketplace', 'READ'), TrendyolSyncController.getJobStatus);
marketplaceRoutes.get('/integrations/:id/trendyol/batch/:batchRequestId', requirePermission('marketplace', 'READ'), TrendyolSyncController.getBatchResult);

// Listlemeler
marketplaceRoutes.get('/listings', requirePermission('marketplace', 'READ'), MarketplaceListingController.list);
marketplaceRoutes.post('/listings', requirePermission('marketplace', 'CREATE'), MarketplaceListingController.create);
marketplaceRoutes.post('/listings/:id/publish', requirePermission('marketplace', 'UPDATE'), MarketplaceListingController.publishToMarketplace);
marketplaceRoutes.post('/listings/:id/update-marketplace', requirePermission('marketplace', 'UPDATE'), MarketplaceListingController.updateMarketplaceProduct);
marketplaceRoutes.post('/listings/:id/delete-marketplace', requirePermission('marketplace', 'DELETE'), MarketplaceListingController.deleteMarketplaceProduct);
marketplaceRoutes.patch('/listings/:id', requirePermission('marketplace', 'UPDATE'), MarketplaceListingController.update);
marketplaceRoutes.delete('/listings/:id', requirePermission('marketplace', 'DELETE'), MarketplaceListingController.remove);

// Siparişler
marketplaceRoutes.get('/orders', requirePermission('marketplace', 'READ'), MarketplaceOrderController.list);
marketplaceRoutes.get('/orders/:id', requirePermission('marketplace', 'READ'), MarketplaceOrderController.getById);
marketplaceRoutes.post('/orders/:id/status', requirePermission('marketplace', 'UPDATE'), MarketplaceOrderController.changeStatus);
marketplaceRoutes.delete('/orders/:id', requirePermission('marketplace', 'DELETE'), MarketplaceOrderController.remove);

// Monitoring (read-only)
marketplaceRoutes.get('/sync-jobs', requirePermission('marketplace', 'READ'), MarketplaceMonitoringController.listSyncJobs);
marketplaceRoutes.get('/sync-jobs/:id', requirePermission('marketplace', 'READ'), MarketplaceMonitoringController.getSyncJob);
marketplaceRoutes.post('/sync-jobs/:id/retry', requirePermission('marketplace', 'UPDATE'), MarketplaceMonitoringController.retrySyncJob);
marketplaceRoutes.get('/webhook-events', requirePermission('marketplace', 'READ'), MarketplaceMonitoringController.listWebhookEvents);
marketplaceRoutes.get('/webhook-events/:id', requirePermission('marketplace', 'READ'), MarketplaceMonitoringController.getWebhookEvent);
marketplaceRoutes.get('/listing-snapshots', requirePermission('marketplace', 'READ'), MarketplaceMonitoringController.listSnapshots);

export { marketplaceRoutes };
