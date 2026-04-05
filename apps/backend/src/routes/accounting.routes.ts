import { Hono } from 'hono';
import { AccountingController, AccountingExtController } from '../controllers/accounting.controller';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { MODULE_KEYS } from '../types/module.types';

const accountingRoutes = new Hono();

accountingRoutes.use('*', requireModule(MODULE_KEYS.ACCOUNTING));

// Hesap planı
accountingRoutes.get('/accounts', requirePermission('accounting', 'READ'), AccountingController.listAccounts);
accountingRoutes.post('/accounts', requirePermission('accounting', 'CREATE'), AccountingController.createAccount);
accountingRoutes.get('/accounts/:id', requirePermission('accounting', 'READ'), AccountingExtController.getAccountById);
accountingRoutes.patch('/accounts/:id', requirePermission('accounting', 'UPDATE'), AccountingExtController.updateAccount);

// Yevmiye fişleri
accountingRoutes.get('/journal-entries', requirePermission('accounting', 'READ'), AccountingController.listJournalEntries);
accountingRoutes.post('/journal-entries', requirePermission('accounting', 'CREATE'), AccountingController.createJournalEntry);
accountingRoutes.get('/journal-entries/:id', requirePermission('accounting', 'READ'), AccountingExtController.getJournalEntryById);
accountingRoutes.post('/journal-entries/:id/post', requirePermission('accounting', 'UPDATE'), AccountingController.postJournalEntry);
accountingRoutes.patch('/journal-entries/:id', requirePermission('accounting', 'UPDATE'), AccountingController.updateJournalEntry);
accountingRoutes.post('/journal-entries/:id/reverse', requirePermission('accounting', 'UPDATE'), AccountingController.reverseJournalEntry);

// Mali dönemler
accountingRoutes.get('/fiscal-periods', requirePermission('accounting', 'READ'), AccountingExtController.listFiscalPeriods);
accountingRoutes.post('/fiscal-periods', requirePermission('accounting', 'CREATE'), AccountingExtController.createFiscalPeriod);
accountingRoutes.post('/fiscal-periods/:id/close', requirePermission('accounting', 'UPDATE'), AccountingExtController.closeFiscalPeriod);

export { accountingRoutes };
