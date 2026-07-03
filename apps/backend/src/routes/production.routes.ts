import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { WorkCenterController } from '../controllers/work-center.controller';
import { BOMController } from '../controllers/bom.controller';
import { WorkOrderController } from '../controllers/work-order.controller';
import { MrpPlanningController } from '../controllers/mrp-planning.controller';
import { CapacityPlanningController } from '../controllers/capacity-planning.controller';
import { QualityControlController } from '../controllers/quality-control.controller';

const productionRoutes = new Hono();

productionRoutes.use('*', requireAccess(ACCESS_POLICIES.production));
productionRoutes.get('/capacity-planning', requirePermission('production', 'READ'), CapacityPlanningController.get);
productionRoutes.get('/mrp', requirePermission('production', 'READ'), MrpPlanningController.get);
productionRoutes.get('/quality-control', requirePermission('production', 'READ'), QualityControlController.get);

// İş Merkezleri
productionRoutes.get('/work-centers', requirePermission('production', 'READ'), WorkCenterController.list);
productionRoutes.get('/work-centers/:id', requirePermission('production', 'READ'), WorkCenterController.getById);
productionRoutes.get('/work-centers/:id/capacity', requirePermission('production', 'READ'), WorkCenterController.getCapacityCalendar);
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
productionRoutes.patch('/work-orders/:id/operations/:operationId', requirePermission('production', 'UPDATE'), WorkOrderController.updateOperation);
productionRoutes.delete('/work-orders/:id', requirePermission('production', 'DELETE'), WorkOrderController.remove);

export { productionRoutes };
