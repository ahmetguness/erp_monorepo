import { Hono } from 'hono';
import { FeatureKey, Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requireFeature } from '../middleware/requireFeature';
import { requireModule } from '../middleware/requireModule';
import { MODULE_KEYS } from '../types/module.types';
import { WorkCenterController } from '../controllers/work-center.controller';
import { BOMController } from '../controllers/bom.controller';
import { WorkOrderController } from '../controllers/work-order.controller';

const productionRoutes = new Hono();

productionRoutes.use('*', requirePlan(Plan.ENTERPRISE));
productionRoutes.use('*', requireFeature(FeatureKey.PRODUCTION));
productionRoutes.use('*', requireModule(MODULE_KEYS.PRODUCTION));

// İş Merkezleri
productionRoutes.get('/work-centers', WorkCenterController.list);
productionRoutes.get('/work-centers/:id', WorkCenterController.getById);
productionRoutes.post('/work-centers', WorkCenterController.create);
productionRoutes.patch('/work-centers/:id', WorkCenterController.update);
productionRoutes.delete('/work-centers/:id', WorkCenterController.remove);

// BOM
productionRoutes.get('/boms', BOMController.list);
productionRoutes.get('/boms/:id', BOMController.getById);
productionRoutes.post('/boms', BOMController.create);
productionRoutes.patch('/boms/:id', BOMController.update);
productionRoutes.post('/boms/:id/items', BOMController.addItem);
productionRoutes.delete('/boms/:id/items/:itemId', BOMController.removeItem);
productionRoutes.post('/boms/:id/routings', BOMController.addRouting);
productionRoutes.delete('/boms/:id/routings/:routingId', BOMController.removeRouting);

// İş Emirleri
productionRoutes.get('/work-orders', WorkOrderController.list);
productionRoutes.get('/work-orders/:id', WorkOrderController.getById);
productionRoutes.post('/work-orders', WorkOrderController.create);
productionRoutes.post('/work-orders/:id/status', WorkOrderController.changeStatus);
productionRoutes.post('/work-orders/:id/report', WorkOrderController.reportProduction);
productionRoutes.delete('/work-orders/:id', WorkOrderController.remove);

export { productionRoutes };
