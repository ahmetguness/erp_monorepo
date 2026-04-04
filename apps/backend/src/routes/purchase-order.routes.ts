import { Hono } from 'hono';
import { PurchaseOrderController } from '../controllers/purchase-order.controller';
import { requireModule } from '../middleware/requireModule';
import { MODULE_KEYS } from '../types/module.types';

const purchaseOrderRoutes = new Hono();

purchaseOrderRoutes.use('*', requireModule(MODULE_KEYS.INVOICING));

// Purchase Requests
purchaseOrderRoutes.get('/requests', PurchaseOrderController.listRequests);
purchaseOrderRoutes.post('/requests', PurchaseOrderController.createRequest);
purchaseOrderRoutes.post('/requests/:id/approve', PurchaseOrderController.approveRequest);
purchaseOrderRoutes.post('/requests/:id/convert', PurchaseOrderController.convertRequestToOrder);

// Purchase Orders
purchaseOrderRoutes.get('/', PurchaseOrderController.listOrders);
purchaseOrderRoutes.get('/:id', PurchaseOrderController.getOrderById);
purchaseOrderRoutes.post('/', PurchaseOrderController.createOrder);
purchaseOrderRoutes.post('/:id/send', PurchaseOrderController.sendOrder);
purchaseOrderRoutes.post('/:id/receive', PurchaseOrderController.receiveOrder);
purchaseOrderRoutes.post('/:id/cancel', PurchaseOrderController.cancelOrder);

export { purchaseOrderRoutes };
