import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';
import { CustomerAssetController } from '../controllers/customer-asset.controller';
import { ServiceRequestController } from '../controllers/service-request.controller';
import { MaintenanceManagementController } from '../controllers/maintenance-management.controller';
import { FieldServiceMobileController } from '../controllers/field-service-mobile.controller';
import { AdvancedServiceController } from '../controllers/advanced-service.controller';

const serviceRoutes = new Hono();

serviceRoutes.use('*', requireAccess(ACCESS_POLICIES.service));
serviceRoutes.get('/advanced', requirePermission('service', 'READ'), AdvancedServiceController.get);
serviceRoutes.get('/maintenance', requirePermission('service', 'READ'), MaintenanceManagementController.get);
serviceRoutes.get('/mobile-flow', requirePermission('service', 'READ'), FieldServiceMobileController.get);
serviceRoutes.post('/mobile-flow/:id/checkpoint', requirePermission('service', 'UPDATE'), FieldServiceMobileController.checkpoint);

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
serviceRoutes.post('/requests/check-sla', requirePermission('service', 'UPDATE'), ServiceRequestController.checkSlaBreaches);
serviceRoutes.post('/requests/:id/assign', requirePermission('service', 'UPDATE'), ServiceRequestController.assign);
serviceRoutes.post('/requests/:id/items', requirePermission('service', 'UPDATE'), ServiceRequestController.addItem);
serviceRoutes.delete('/requests/:id/items/:itemId', requirePermission('service', 'UPDATE'), ServiceRequestController.removeItem);
serviceRoutes.post('/requests/:id/activities', requirePermission('service', 'UPDATE'), ServiceRequestController.addActivity);
serviceRoutes.delete('/requests/:id', requirePermission('service', 'DELETE'), ServiceRequestController.remove);

export { serviceRoutes };
