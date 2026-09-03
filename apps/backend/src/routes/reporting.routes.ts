import { FeatureKey } from '@prisma/client';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { Hono } from 'hono';
import { requireAccess } from '../middleware/requireAccess';
import { requireFeature } from '../middleware/requireFeature';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { ReportingBuilderController,ReportingController,SavedReportController } from '../modules/platform/http/controllers/index.js';
import { ReportInsightsController } from '../modules/reporting/http/controllers/index.js';
import { MODULE_KEYS } from '../types/module.types';

const reportingRoutes = new Hono();

reportingRoutes.use('*', requireModule(MODULE_KEYS.REPORTING));

reportingRoutes.get('/revenue-summary', requirePermission('reporting', 'READ'), ReportingController.revenueSummary);
reportingRoutes.get('/expense-summary', requirePermission('reporting', 'READ'), ReportingController.expenseSummary);
reportingRoutes.get('/stock-summary', requirePermission('reporting', 'READ'), ReportingController.stockSummary);
reportingRoutes.get('/contact-balance', requirePermission('reporting', 'READ'), ReportingController.contactBalance);
reportingRoutes.get('/collection-list', requirePermission('reporting', 'READ'), ReportingController.collectionList);
reportingRoutes.get('/top-products', requirePermission('reporting', 'READ'), ReportingController.topProducts);
reportingRoutes.get('/cashflow-forecast', requireAccess(ACCESS_POLICIES.cashflowForecast), requirePermission('reporting', 'READ'), ReportingController.cashflowForecast);
reportingRoutes.get('/decision-insights', requirePermission('reporting', 'READ'), ReportInsightsController.workspace);

reportingRoutes.get('/registry', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'READ'), ReportingBuilderController.registry);
reportingRoutes.post('/kpi/preview', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'READ'), ReportingBuilderController.preview);

reportingRoutes.get('/saved', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'READ'), SavedReportController.list);
reportingRoutes.post('/saved/:id/export-audit', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'EXPORT'), SavedReportController.exportAudit);
reportingRoutes.post('/saved/:id/run-schedule', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'EXPORT'), SavedReportController.runSchedule);
reportingRoutes.get('/saved/:id', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'READ'), SavedReportController.getById);
reportingRoutes.post('/saved', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'CREATE'), SavedReportController.create);
reportingRoutes.patch('/saved/:id', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'UPDATE'), SavedReportController.update);
reportingRoutes.delete('/saved/:id', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'DELETE'), SavedReportController.remove);

export { reportingRoutes };
