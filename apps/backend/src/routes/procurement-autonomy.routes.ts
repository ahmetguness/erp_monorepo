import { Hono } from 'hono';
import { ProcurementAutonomyController } from '../services/controllers/procurement-autonomy.controller.service.js';

const procurementAutonomyRoutes = new Hono();

procurementAutonomyRoutes.get('/projections', ProcurementAutonomyController.getProjections);
procurementAutonomyRoutes.get('/suppliers', ProcurementAutonomyController.getSuppliers);
procurementAutonomyRoutes.post('/dispatch-po', ProcurementAutonomyController.dispatchPo);
procurementAutonomyRoutes.post('/run-scan', ProcurementAutonomyController.runScan);

export { procurementAutonomyRoutes };
