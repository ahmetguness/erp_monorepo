import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requirePermission } from '../middleware/requirePermission';
import { BankTransactionController } from '../controllers/bank-transaction.controller';

const bankTransactionRoutes = new Hono();

bankTransactionRoutes.use('*', requirePlan(Plan.PROFESSIONAL));

bankTransactionRoutes.get('/', requirePermission('accounting', 'READ'), BankTransactionController.list);
bankTransactionRoutes.post('/', requirePermission('accounting', 'CREATE'), BankTransactionController.create);
bankTransactionRoutes.post('/:id/match', requirePermission('accounting', 'UPDATE'), BankTransactionController.matchPayment);

export { bankTransactionRoutes };
