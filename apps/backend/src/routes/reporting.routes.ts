import { Hono } from 'hono';
import { ReportingController, SavedReportController } from '../controllers/reporting.controller';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { MODULE_KEYS } from '../types/module.types';

const reportingRoutes = new Hono();

reportingRoutes.use('*', requireModule(MODULE_KEYS.REPORTING));

reportingRoutes.get('/revenue-summary', requirePermission('reporting', 'READ'), ReportingController.revenueSummary);
reportingRoutes.get('/expense-summary', requirePermission('reporting', 'READ'), ReportingController.expenseSummary);
reportingRoutes.get('/stock-summary', requirePermission('reporting', 'READ'), ReportingController.stockSummary);
reportingRoutes.get('/contact-balance', requirePermission('reporting', 'READ'), ReportingController.contactBalance);

reportingRoutes.get('/saved', requirePermission('reporting', 'READ'), SavedReportController.list);
reportingRoutes.get('/saved/:id', requirePermission('reporting', 'READ'), SavedReportController.getById);
reportingRoutes.post('/saved', requirePermission('reporting', 'CREATE'), SavedReportController.create);
reportingRoutes.patch('/saved/:id', requirePermission('reporting', 'UPDATE'), SavedReportController.update);
reportingRoutes.delete('/saved/:id', requirePermission('reporting', 'DELETE'), SavedReportController.remove);

export { reportingRoutes };
