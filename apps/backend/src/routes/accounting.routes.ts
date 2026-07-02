import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { AccountingController, AccountingExtController } from '../controllers/accounting.controller';
import { requireAccess } from '../middleware/requireAccess';
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
accountingRoutes.get('/fiscal-periods/:id/closing-checklist', requireAccess(ACCESS_POLICIES.reconciliations), requirePermission('accounting', 'READ'), AccountingExtController.getFiscalPeriodClosingChecklist);
accountingRoutes.post('/fiscal-periods/:id/close', requirePermission('accounting', 'UPDATE'), AccountingExtController.closeFiscalPeriod);
accountingRoutes.post('/fiscal-periods/:id/lock', requirePermission('accounting', 'UPDATE'), AccountingExtController.lockFiscalPeriod);
accountingRoutes.post('/fiscal-periods/:id/reopen', requirePermission('accounting', 'UPDATE'), AccountingExtController.reopenFiscalPeriod);
accountingRoutes.delete('/fiscal-periods/:id', requirePermission('accounting', 'DELETE'), AccountingExtController.deleteFiscalPeriod);

// Mizan ve Cari Ekstre
accountingRoutes.get('/trial-balance', requirePermission('accounting', 'READ'), AccountingExtController.getTrialBalance);
accountingRoutes.get('/account-statement/:contactId', requirePermission('accounting', 'READ'), AccountingExtController.getContactStatement);

export { accountingRoutes };

