import { Hono } from 'hono';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { PurchaseOrderController } from '../controllers/purchase-order.controller';
import { requireAccess } from '../middleware/requireAccess';
import { requirePermission } from '../middleware/requirePermission';

const purchaseOrderRoutes = new Hono();

purchaseOrderRoutes.use('*', requireAccess(ACCESS_POLICIES.purchasing));

purchaseOrderRoutes.get('/requests', requirePermission('purchasing', 'READ'), PurchaseOrderController.listRequests);
purchaseOrderRoutes.post('/requests', requirePermission('purchasing', 'CREATE'), PurchaseOrderController.createRequest);
purchaseOrderRoutes.post('/requests/:id/approve', requirePermission('purchasing', 'UPDATE'), PurchaseOrderController.approveRequest);
purchaseOrderRoutes.post('/requests/:id/convert', requirePermission('purchasing', 'CREATE'), PurchaseOrderController.convertRequestToOrder);

purchaseOrderRoutes.get('/', requirePermission('purchasing', 'READ'), PurchaseOrderController.listOrders);
purchaseOrderRoutes.get('/:id', requirePermission('purchasing', 'READ'), PurchaseOrderController.getOrderById);
purchaseOrderRoutes.get('/:id/history', requirePermission('purchasing', 'READ'), PurchaseOrderController.getOrderHistory);
purchaseOrderRoutes.post('/', requirePermission('purchasing', 'CREATE'), PurchaseOrderController.createOrder);
purchaseOrderRoutes.post('/:id/send', requirePermission('purchasing', 'UPDATE'), PurchaseOrderController.sendOrder);
purchaseOrderRoutes.post('/:id/receive', requirePermission('purchasing', 'UPDATE'), PurchaseOrderController.receiveOrder);
purchaseOrderRoutes.post('/:id/cancel', requirePermission('purchasing', 'UPDATE'), PurchaseOrderController.cancelOrder);

export { purchaseOrderRoutes };
