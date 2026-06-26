import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import {
  MarketplaceIntegrationController,
  MarketplaceListingController,
  MarketplaceOrderController,
  TrendyolSyncController,
  TrendyolLookupController,
  MarketplaceMonitoringController,
} from '../controllers/marketplace.controller';

const marketplaceRoutes = new Hono();

marketplaceRoutes.use('*', requireAccess(ACCESS_POLICIES.marketplace));

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
marketplaceRoutes.get('/integrations/:id/trendyol/categories', requirePermission('marketplace', 'READ'), TrendyolLookupController.categories);
marketplaceRoutes.get('/integrations/:id/trendyol/brands', requirePermission('marketplace', 'READ'), TrendyolLookupController.brands);
marketplaceRoutes.get('/integrations/:id/trendyol/attributes', requirePermission('marketplace', 'READ'), TrendyolLookupController.attributes);
marketplaceRoutes.get('/integrations/:id/trendyol/cargo-providers', requirePermission('marketplace', 'READ'), TrendyolLookupController.cargoProviders);

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
marketplaceRoutes.get('/health', requirePermission('marketplace', 'READ'), MarketplaceMonitoringController.health);
marketplaceRoutes.get('/drift-report', requirePermission('marketplace', 'READ'), MarketplaceMonitoringController.driftReport);
marketplaceRoutes.get('/sync-jobs', requirePermission('marketplace', 'READ'), MarketplaceMonitoringController.listSyncJobs);
marketplaceRoutes.get('/sync-jobs/:id', requirePermission('marketplace', 'READ'), MarketplaceMonitoringController.getSyncJob);
marketplaceRoutes.post('/sync-jobs/:id/retry', requirePermission('marketplace', 'UPDATE'), MarketplaceMonitoringController.retrySyncJob);
marketplaceRoutes.get('/webhook-events', requirePermission('marketplace', 'READ'), MarketplaceMonitoringController.listWebhookEvents);
marketplaceRoutes.post('/webhook-events/:id/replay', requirePermission('marketplace', 'UPDATE'), MarketplaceMonitoringController.replayWebhookEvent);
marketplaceRoutes.get('/webhook-events/:id', requirePermission('marketplace', 'READ'), MarketplaceMonitoringController.getWebhookEvent);
marketplaceRoutes.get('/listing-snapshots', requirePermission('marketplace', 'READ'), MarketplaceMonitoringController.listSnapshots);

export { marketplaceRoutes };
