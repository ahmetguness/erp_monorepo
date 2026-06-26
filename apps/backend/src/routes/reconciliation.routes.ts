import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { ReconciliationController } from '../controllers/reconciliation.controller';

const reconciliationRoutes = new Hono();

reconciliationRoutes.use('*', requireAccess(ACCESS_POLICIES.reconciliations));

reconciliationRoutes.get('/', requirePermission('accounting', 'READ'), ReconciliationController.list);
reconciliationRoutes.get('/:id', requirePermission('accounting', 'READ'), ReconciliationController.getById);
reconciliationRoutes.post('/', requirePermission('accounting', 'CREATE'), ReconciliationController.create);
reconciliationRoutes.post('/:id/lines', requirePermission('accounting', 'UPDATE'), ReconciliationController.addLine);
reconciliationRoutes.post('/:id/finalize', requirePermission('accounting', 'UPDATE'), ReconciliationController.finalize);

export { reconciliationRoutes };
