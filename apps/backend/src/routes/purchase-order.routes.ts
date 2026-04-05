import { Hono } from 'hono';
import { PurchaseOrderController } from '../controllers/purchase-order.controller';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { MODULE_KEYS } from '../types/module.types';

const purchaseOrderRoutes = new Hono();

purchaseOrderRoutes.use('*', requireModule(MODULE_KEYS.INVOICING));

purchaseOrderRoutes.get('/requests', requirePermission('purchasing', 'READ'), PurchaseOrderController.listRequests);
purchaseOrderRoutes.post('/requests', requirePermission('purchasing', 'CREATE'), PurchaseOrderController.createRequest);
purchaseOrderRoutes.post('/requests/:id/approve', requirePermission('purchasing', 'UPDATE'), PurchaseOrderController.approveRequest);
purchaseOrderRoutes.post('/requests/:id/convert', requirePermission('purchasing', 'CREATE'), PurchaseOrderController.convertRequestToOrder);

purchaseOrderRoutes.get('/', requirePermission('purchasing', 'READ'), PurchaseOrderController.listOrders);
purchaseOrderRoutes.get('/:id', requirePermission('purchasing', 'READ'), PurchaseOrderController.getOrderById);
purchaseOrderRoutes.post('/', requirePermission('purchasing', 'CREATE'), PurchaseOrderController.createOrder);
purchaseOrderRoutes.post('/:id/send', requirePermission('purchasing', 'UPDATE'), PurchaseOrderController.sendOrder);
purchaseOrderRoutes.post('/:id/receive', requirePermission('purchasing', 'UPDATE'), PurchaseOrderController.receiveOrder);
purchaseOrderRoutes.post('/:id/cancel', requirePermission('purchasing', 'UPDATE'), PurchaseOrderController.cancelOrder);

export { purchaseOrderRoutes };
