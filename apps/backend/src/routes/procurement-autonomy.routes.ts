import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { ProcurementAutonomyController } from '../modules/procurement/http/controllers/index.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { requireAccess } from '../middleware/requireAccess.js';

const procurementAutonomyRoutes = new Hono();

procurementAutonomyRoutes.use('*', requireAccess(ACCESS_POLICIES.purchasing));

procurementAutonomyRoutes.get('/planning-workspace', requirePermission('purchasing', 'READ'), ProcurementAutonomyController.planningWorkspace);
procurementAutonomyRoutes.put('/planning-policy', requirePermission('purchasing', 'UPDATE'), ProcurementAutonomyController.updatePlanningPolicy);
procurementAutonomyRoutes.post('/planning-run', requirePermission('purchasing', 'CREATE'), ProcurementAutonomyController.runPlanning);
procurementAutonomyRoutes.get('/projections', requirePermission('purchasing', 'READ'), ProcurementAutonomyController.getProjections);
procurementAutonomyRoutes.get('/suppliers', requirePermission('purchasing', 'READ'), ProcurementAutonomyController.getSuppliers);
procurementAutonomyRoutes.post('/dispatch-po', requirePermission('purchasing', 'CREATE'), ProcurementAutonomyController.dispatchPo);
procurementAutonomyRoutes.post('/run-scan', requirePermission('purchasing', 'CREATE'), ProcurementAutonomyController.runScan);

export { procurementAutonomyRoutes };
