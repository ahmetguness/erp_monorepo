import { Hono } from 'hono';
import { requirePlan } from '../middleware/requirePlan';
import { BankTransactionController } from '../controllers/bank-transaction.controller';

const bankTransactionRoutes = new Hono();

bankTransactionRoutes.use('*', requirePlan('PROFESSIONAL'));

bankTransactionRoutes.get('/', BankTransactionController.list);
bankTransactionRoutes.post('/', BankTransactionController.create);
bankTransactionRoutes.post('/:id/match', BankTransactionController.matchPayment);

export { bankTransactionRoutes };
