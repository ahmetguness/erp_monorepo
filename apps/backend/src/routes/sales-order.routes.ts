import { Hono } from 'hono';
import { SalesOrderController } from '../controllers/sales-order.controller';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { MODULE_KEYS } from '../types/module.types';

const salesOrderRoutes = new Hono();

salesOrderRoutes.use('*', requireModule(MODULE_KEYS.INVOICING));

salesOrderRoutes.get('/quotes', requirePermission('invoicing', 'READ'), SalesOrderController.listQuotes);
salesOrderRoutes.get('/quotes/:id', requirePermission('invoicing', 'READ'), SalesOrderController.getQuoteById);
salesOrderRoutes.post('/quotes', requirePermission('invoicing', 'CREATE'), SalesOrderController.createQuote);
salesOrderRoutes.post('/quotes/:id/convert', requirePermission('invoicing', 'CREATE'), SalesOrderController.convertQuoteToOrder);

salesOrderRoutes.get('/', requirePermission('invoicing', 'READ'), SalesOrderController.listOrders);
salesOrderRoutes.get('/:id', requirePermission('invoicing', 'READ'), SalesOrderController.getOrderById);
salesOrderRoutes.get('/:id/history', requirePermission('invoicing', 'READ'), SalesOrderController.getOrderHistory);
salesOrderRoutes.post('/', requirePermission('invoicing', 'CREATE'), SalesOrderController.createOrder);
salesOrderRoutes.patch('/:id', requirePermission('invoicing', 'UPDATE'), SalesOrderController.updateOrder);
salesOrderRoutes.post('/:id/cancel', requirePermission('invoicing', 'UPDATE'), SalesOrderController.cancelOrder);

export { salesOrderRoutes };
