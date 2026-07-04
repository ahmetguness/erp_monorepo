import { Hono } from 'hono';
import { FeatureKey } from '@prisma/client';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { ReportingBuilderController, ReportingController, SavedReportController } from '../controllers/reporting.controller';
import { requireModule } from '../middleware/requireModule';
import { requireAccess } from '../middleware/requireAccess';
import { requireFeature } from '../middleware/requireFeature';
import { requirePermission } from '../middleware/requirePermission';
import { MODULE_KEYS } from '../types/module.types';

const reportingRoutes = new Hono();

reportingRoutes.use('*', requireModule(MODULE_KEYS.REPORTING));

reportingRoutes.get('/revenue-summary', requirePermission('reporting', 'READ'), ReportingController.revenueSummary);
reportingRoutes.get('/expense-summary', requirePermission('reporting', 'READ'), ReportingController.expenseSummary);
reportingRoutes.get('/stock-summary', requirePermission('reporting', 'READ'), ReportingController.stockSummary);
reportingRoutes.get('/contact-balance', requirePermission('reporting', 'READ'), ReportingController.contactBalance);
reportingRoutes.get('/collection-list', requirePermission('reporting', 'READ'), ReportingController.collectionList);
reportingRoutes.get('/cashflow-forecast', requireAccess(ACCESS_POLICIES.cashflowForecast), requirePermission('reporting', 'READ'), ReportingController.cashflowForecast);

reportingRoutes.get('/registry', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'READ'), ReportingBuilderController.registry);
reportingRoutes.post('/kpi/preview', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'READ'), ReportingBuilderController.preview);

reportingRoutes.get('/saved', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'READ'), SavedReportController.list);
reportingRoutes.post('/saved/:id/export-audit', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'EXPORT'), SavedReportController.exportAudit);
reportingRoutes.get('/saved/:id', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'READ'), SavedReportController.getById);
reportingRoutes.post('/saved', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'CREATE'), SavedReportController.create);
reportingRoutes.patch('/saved/:id', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'UPDATE'), SavedReportController.update);
reportingRoutes.delete('/saved/:id', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'DELETE'), SavedReportController.remove);

export { reportingRoutes };
