import { Hono } from 'hono';
import { SalesOrderController } from '../controllers/sales-order.controller';
import { requireModule } from '../middleware/requireModule';
import { MODULE_KEYS } from '../types/module.types';

const salesOrderRoutes = new Hono();

salesOrderRoutes.use('*', requireModule(MODULE_KEYS.INVOICING));

// Sales Quotes
salesOrderRoutes.get('/quotes', SalesOrderController.listQuotes);
salesOrderRoutes.get('/quotes/:id', SalesOrderController.getQuoteById);
salesOrderRoutes.post('/quotes', SalesOrderController.createQuote);
salesOrderRoutes.post('/quotes/:id/convert', SalesOrderController.convertQuoteToOrder);

// Sales Orders
salesOrderRoutes.get('/', SalesOrderController.listOrders);
salesOrderRoutes.get('/:id', SalesOrderController.getOrderById);
salesOrderRoutes.post('/', SalesOrderController.createOrder);
salesOrderRoutes.patch('/:id', SalesOrderController.updateOrder);
salesOrderRoutes.post('/:id/cancel', SalesOrderController.cancelOrder);

export { salesOrderRoutes };
