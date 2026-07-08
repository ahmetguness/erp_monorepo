import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { BankTransactionController } from '../controllers/bank-transaction.controller';

const bankTransactionRoutes = new Hono();

bankTransactionRoutes.use('*', requireAccess(ACCESS_POLICIES.bankTransactions));

bankTransactionRoutes.get('/', requirePermission('accounting', 'READ'), BankTransactionController.list);
bankTransactionRoutes.post('/', requirePermission('accounting', 'CREATE'), BankTransactionController.create);
bankTransactionRoutes.get('/:id/match-suggestions', requirePermission('accounting', 'READ'), BankTransactionController.suggestions);
bankTransactionRoutes.post('/:id/approve-match', requirePermission('accounting', 'UPDATE'), BankTransactionController.approveMatch);
bankTransactionRoutes.post('/:id/match', requirePermission('accounting', 'UPDATE'), BankTransactionController.matchPayment);

export { bankTransactionRoutes };
