import { Hono } from 'hono';
import { ProcurementAutonomyController } from '../modules/procurement/http/controllers/index.js';

const procurementAutonomyRoutes = new Hono();

procurementAutonomyRoutes.get('/projections', ProcurementAutonomyController.getProjections);
procurementAutonomyRoutes.get('/suppliers', ProcurementAutonomyController.getSuppliers);
procurementAutonomyRoutes.post('/dispatch-po', ProcurementAutonomyController.dispatchPo);
procurementAutonomyRoutes.post('/run-scan', ProcurementAutonomyController.runScan);

export { procurementAutonomyRoutes };
