import { Hono } from 'hono';
import { FeatureKey } from '@prisma/client';
import { ReportingController, SavedReportController } from '../controllers/reporting.controller';
import { requireModule } from '../middleware/requireModule';
import { requireFeature } from '../middleware/requireFeature';
import { requirePermission } from '../middleware/requirePermission';
import { MODULE_KEYS } from '../types/module.types';

const reportingRoutes = new Hono();

reportingRoutes.use('*', requireModule(MODULE_KEYS.REPORTING));

// Temel raporlar — tüm planlara açık
reportingRoutes.get('/revenue-summary', requirePermission('reporting', 'READ'), ReportingController.revenueSummary);
reportingRoutes.get('/expense-summary', requirePermission('reporting', 'READ'), ReportingController.expenseSummary);
reportingRoutes.get('/stock-summary', requirePermission('reporting', 'READ'), ReportingController.stockSummary);
reportingRoutes.get('/contact-balance', requirePermission('reporting', 'READ'), ReportingController.contactBalance);

// Kayıtlı raporlar — CUSTOM_REPORTING feature gerektirir
reportingRoutes.get('/saved', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'READ'), SavedReportController.list);
reportingRoutes.get('/saved/:id', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'READ'), SavedReportController.getById);
reportingRoutes.post('/saved', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'CREATE'), SavedReportController.create);
reportingRoutes.patch('/saved/:id', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'UPDATE'), SavedReportController.update);
reportingRoutes.delete('/saved/:id', requireFeature(FeatureKey.CUSTOM_REPORTING), requirePermission('reporting', 'DELETE'), SavedReportController.remove);

export { reportingRoutes };
