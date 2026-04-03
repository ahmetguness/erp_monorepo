import { Hono } from 'hono';
import { InvoiceController } from '../controllers/invoice.controller';
import { requireModule } from '../middleware/requireModule';
import { MODULE_KEYS } from '../types/module.types';

const invoiceRoutes = new Hono();

invoiceRoutes.use('*', requireModule(MODULE_KEYS.INVOICING));

invoiceRoutes.get('/', InvoiceController.list);
invoiceRoutes.get('/:id', InvoiceController.getById);
invoiceRoutes.post('/', InvoiceController.create);
invoiceRoutes.patch('/:id', InvoiceController.update);
invoiceRoutes.post('/:id/cancel', InvoiceController.cancel);

export { invoiceRoutes };
