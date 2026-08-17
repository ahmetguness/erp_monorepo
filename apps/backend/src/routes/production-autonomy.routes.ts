import { Hono } from 'hono';
import { ProductionAutonomyController } from '../services/controllers/production-autonomy.controller.service.js';

const productionAutonomyRoutes = new Hono();

productionAutonomyRoutes.get('/work-center-capacity', ProductionAutonomyController.getCapacityAnalysis);
productionAutonomyRoutes.post('/optimize-schedule', ProductionAutonomyController.optimizeSchedule);
productionAutonomyRoutes.get('/predictive-maintenance', ProductionAutonomyController.getPredictiveMaintenance);
productionAutonomyRoutes.post('/reserve-maintenance-parts', ProductionAutonomyController.reserveMaintenanceParts);

export { productionAutonomyRoutes };
