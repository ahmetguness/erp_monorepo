import { Hono } from 'hono';
import { AccountingController, AccountingExtController } from '../controllers/accounting.controller';
import { requireModule } from '../middleware/requireModule';
import { MODULE_KEYS } from '../types/module.types';

const accountingRoutes = new Hono();

accountingRoutes.use('*', requireModule(MODULE_KEYS.ACCOUNTING));

// Hesap planı
accountingRoutes.get('/accounts', AccountingController.listAccounts);
accountingRoutes.post('/accounts', AccountingController.createAccount);
accountingRoutes.get('/accounts/:id', AccountingExtController.getAccountById);
accountingRoutes.patch('/accounts/:id', AccountingExtController.updateAccount);

// Yevmiye fişleri
accountingRoutes.get('/journal-entries', AccountingController.listJournalEntries);
accountingRoutes.post('/journal-entries', AccountingController.createJournalEntry);
accountingRoutes.get('/journal-entries/:id', AccountingExtController.getJournalEntryById);
accountingRoutes.post('/journal-entries/:id/post', AccountingController.postJournalEntry);

// Mali dönemler
accountingRoutes.get('/fiscal-periods', AccountingExtController.listFiscalPeriods);
accountingRoutes.post('/fiscal-periods', AccountingExtController.createFiscalPeriod);
accountingRoutes.post('/fiscal-periods/:id/close', AccountingExtController.closeFiscalPeriod);

export { accountingRoutes };
