import { Hono } from 'hono';
import { FeatureKey, Plan } from '@prisma/client';
import { requirePlan } from '../middleware/requirePlan';
import { requireFeature } from '../middleware/requireFeature';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { MODULE_KEYS } from '../types/module.types';
import { CustomerAssetController } from '../controllers/customer-asset.controller';
import { ServiceRequestController } from '../controllers/service-request.controller';

const serviceRoutes = new Hono();

serviceRoutes.use('*', requirePlan(Plan.ENTERPRISE));
serviceRoutes.use('*', requireFeature(FeatureKey.SERVICE));
serviceRoutes.use('*', requireModule(MODULE_KEYS.SERVICE));

// Müşteri Varlıkları
serviceRoutes.get('/assets', requirePermission('service', 'READ'), CustomerAssetController.list);
serviceRoutes.get('/assets/:id', requirePermission('service', 'READ'), CustomerAssetController.getById);
serviceRoutes.post('/assets', requirePermission('service', 'CREATE'), CustomerAssetController.create);
serviceRoutes.patch('/assets/:id', requirePermission('service', 'UPDATE'), CustomerAssetController.update);
serviceRoutes.delete('/assets/:id', requirePermission('service', 'DELETE'), CustomerAssetController.remove);

// Servis Talepleri
serviceRoutes.get('/requests', requirePermission('service', 'READ'), ServiceRequestController.list);
serviceRoutes.get('/requests/:id', requirePermission('service', 'READ'), ServiceRequestController.getById);
serviceRoutes.post('/requests', requirePermission('service', 'CREATE'), ServiceRequestController.create);
serviceRoutes.patch('/requests/:id', requirePermission('service', 'UPDATE'), ServiceRequestController.update);
serviceRoutes.post('/requests/:id/status', requirePermission('service', 'UPDATE'), ServiceRequestController.changeStatus);
serviceRoutes.post('/requests/:id/assign', requirePermission('service', 'UPDATE'), ServiceRequestController.assign);
serviceRoutes.post('/requests/:id/items', requirePermission('service', 'UPDATE'), ServiceRequestController.addItem);
serviceRoutes.delete('/requests/:id/items/:itemId', requirePermission('service', 'UPDATE'), ServiceRequestController.removeItem);
serviceRoutes.post('/requests/:id/activities', requirePermission('service', 'UPDATE'), ServiceRequestController.addActivity);
serviceRoutes.delete('/requests/:id', requirePermission('service', 'DELETE'), ServiceRequestController.remove);

export { serviceRoutes };
