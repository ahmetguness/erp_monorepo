import { Hono } from 'hono';
import { InvoiceController } from '../controllers/invoice.controller';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { MODULE_KEYS } from '../types/module.types';

const invoiceRoutes = new Hono();

invoiceRoutes.use('*', requireModule(MODULE_KEYS.INVOICING));

invoiceRoutes.get('/', requirePermission('invoicing', 'READ'), InvoiceController.list);
invoiceRoutes.get('/:id', requirePermission('invoicing', 'READ'), InvoiceController.getById);
invoiceRoutes.post('/', requirePermission('invoicing', 'CREATE'), InvoiceController.create);
invoiceRoutes.patch('/:id', requirePermission('invoicing', 'UPDATE'), InvoiceController.update);
invoiceRoutes.post('/:id/cancel', requirePermission('invoicing', 'UPDATE'), InvoiceController.cancel);

export { invoiceRoutes };
