import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { ReconciliationController } from '../controllers/reconciliation.controller';

const reconciliationRoutes = new Hono();

reconciliationRoutes.use('*', requirePlan(Plan.PROFESSIONAL));

reconciliationRoutes.get('/', ReconciliationController.list);
reconciliationRoutes.get('/:id', ReconciliationController.getById);
reconciliationRoutes.post('/', ReconciliationController.create);
reconciliationRoutes.post('/:id/lines', ReconciliationController.addLine);
reconciliationRoutes.post('/:id/finalize', ReconciliationController.finalize);

export { reconciliationRoutes };
