import { Hono } from 'hono';
import { Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requirePermission } from '../middleware/requirePermission';
import { ReconciliationController } from '../controllers/reconciliation.controller';

const reconciliationRoutes = new Hono();

reconciliationRoutes.use('*', requirePlan(Plan.PROFESSIONAL));

reconciliationRoutes.get('/', requirePermission('accounting', 'READ'), ReconciliationController.list);
reconciliationRoutes.get('/:id', requirePermission('accounting', 'READ'), ReconciliationController.getById);
reconciliationRoutes.post('/', requirePermission('accounting', 'CREATE'), ReconciliationController.create);
reconciliationRoutes.post('/:id/lines', requirePermission('accounting', 'UPDATE'), ReconciliationController.addLine);
reconciliationRoutes.post('/:id/finalize', requirePermission('accounting', 'UPDATE'), ReconciliationController.finalize);

export { reconciliationRoutes };
