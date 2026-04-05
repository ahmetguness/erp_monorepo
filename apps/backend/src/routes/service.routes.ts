import { Hono } from 'hono';
import { FeatureKey } from '@prisma/client';
import { requireFeature } from '../middleware/requireFeature';
import { requireModule } from '../middleware/requireModule';
import { MODULE_KEYS } from '../types/module.types';
import { CustomerAssetController } from '../controllers/customer-asset.controller';
import { ServiceRequestController } from '../controllers/service-request.controller';

const serviceRoutes = new Hono();

serviceRoutes.use('*', requireFeature(FeatureKey.SERVICE));
serviceRoutes.use('*', requireModule(MODULE_KEYS.SERVICE));

// Müşteri Varlıkları
serviceRoutes.get('/assets', CustomerAssetController.list);
serviceRoutes.get('/assets/:id', CustomerAssetController.getById);
serviceRoutes.post('/assets', CustomerAssetController.create);
serviceRoutes.patch('/assets/:id', CustomerAssetController.update);
serviceRoutes.delete('/assets/:id', CustomerAssetController.remove);

// Servis Talepleri
serviceRoutes.get('/requests', ServiceRequestController.list);
serviceRoutes.get('/requests/:id', ServiceRequestController.getById);
serviceRoutes.post('/requests', ServiceRequestController.create);
serviceRoutes.patch('/requests/:id', ServiceRequestController.update);
serviceRoutes.post('/requests/:id/status', ServiceRequestController.changeStatus);
serviceRoutes.post('/requests/:id/assign', ServiceRequestController.assign);
serviceRoutes.post('/requests/:id/items', ServiceRequestController.addItem);
serviceRoutes.delete('/requests/:id/items/:itemId', ServiceRequestController.removeItem);
serviceRoutes.post('/requests/:id/activities', ServiceRequestController.addActivity);
serviceRoutes.delete('/requests/:id', ServiceRequestController.remove);

export { serviceRoutes };
