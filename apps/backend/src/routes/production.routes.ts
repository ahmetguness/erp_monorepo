import { Hono } from 'hono';
import { FeatureKey, Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requireFeature } from '../middleware/requireFeature';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { MODULE_KEYS } from '../types/module.types';
import { WorkCenterController } from '../controllers/work-center.controller';
import { BOMController } from '../controllers/bom.controller';
import { WorkOrderController } from '../controllers/work-order.controller';

const productionRoutes = new Hono();

productionRoutes.use('*', requirePlan(Plan.ENTERPRISE));
productionRoutes.use('*', requireFeature(FeatureKey.PRODUCTION));
productionRoutes.use('*', requireModule(MODULE_KEYS.PRODUCTION));

// İş Merkezleri
productionRoutes.get('/work-centers', requirePermission('production', 'READ'), WorkCenterController.list);
productionRoutes.get('/work-centers/:id', requirePermission('production', 'READ'), WorkCenterController.getById);
productionRoutes.post('/work-centers', requirePermission('production', 'CREATE'), WorkCenterController.create);
productionRoutes.patch('/work-centers/:id', requirePermission('production', 'UPDATE'), WorkCenterController.update);
productionRoutes.delete('/work-centers/:id', requirePermission('production', 'DELETE'), WorkCenterController.remove);

// BOM
productionRoutes.get('/boms', requirePermission('production', 'READ'), BOMController.list);
productionRoutes.get('/boms/:id', requirePermission('production', 'READ'), BOMController.getById);
productionRoutes.post('/boms', requirePermission('production', 'CREATE'), BOMController.create);
productionRoutes.patch('/boms/:id', requirePermission('production', 'UPDATE'), BOMController.update);
productionRoutes.post('/boms/:id/items', requirePermission('production', 'UPDATE'), BOMController.addItem);
productionRoutes.delete('/boms/:id/items/:itemId', requirePermission('production', 'UPDATE'), BOMController.removeItem);
productionRoutes.post('/boms/:id/routings', requirePermission('production', 'UPDATE'), BOMController.addRouting);
productionRoutes.delete('/boms/:id/routings/:routingId', requirePermission('production', 'UPDATE'), BOMController.removeRouting);

// İş Emirleri
productionRoutes.get('/work-orders', requirePermission('production', 'READ'), WorkOrderController.list);
productionRoutes.get('/work-orders/:id', requirePermission('production', 'READ'), WorkOrderController.getById);
productionRoutes.post('/work-orders', requirePermission('production', 'CREATE'), WorkOrderController.create);
productionRoutes.post('/work-orders/:id/status', requirePermission('production', 'UPDATE'), WorkOrderController.changeStatus);
productionRoutes.post('/work-orders/:id/report', requirePermission('production', 'UPDATE'), WorkOrderController.reportProduction);
productionRoutes.delete('/work-orders/:id', requirePermission('production', 'DELETE'), WorkOrderController.remove);

export { productionRoutes };
