import { Hono } from 'hono';
import { ReportingController, SavedReportController } from '../controllers/reporting.controller';
import { requireModule } from '../middleware/requireModule';
import { MODULE_KEYS } from '../types/module.types';

const reportingRoutes = new Hono();

reportingRoutes.use('*', requireModule(MODULE_KEYS.REPORTING));

// Hazır raporlar
reportingRoutes.get('/revenue-summary', ReportingController.revenueSummary);
reportingRoutes.get('/expense-summary', ReportingController.expenseSummary);
reportingRoutes.get('/stock-summary', ReportingController.stockSummary);
reportingRoutes.get('/contact-balance', ReportingController.contactBalance);

// Kayıtlı raporlar
reportingRoutes.get('/saved', SavedReportController.list);
reportingRoutes.get('/saved/:id', SavedReportController.getById);
reportingRoutes.post('/saved', SavedReportController.create);
reportingRoutes.patch('/saved/:id', SavedReportController.update);
reportingRoutes.delete('/saved/:id', SavedReportController.remove);

export { reportingRoutes };
