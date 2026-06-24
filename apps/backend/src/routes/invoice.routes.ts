import { Hono } from 'hono';
import { InvoiceController } from '../controllers/invoice.controller';
import { requireModule } from '../middleware/requireModule';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validateBody';
import { createInvoiceBodySchema, updateInvoiceBodySchema } from '../schemas/request-body.schemas';
import { MODULE_KEYS } from '../types/module.types';

const invoiceRoutes = new Hono();

invoiceRoutes.use('*', requireModule(MODULE_KEYS.INVOICING));

invoiceRoutes.get('/', requirePermission('invoicing', 'READ'), InvoiceController.list);
invoiceRoutes.get('/:id', requirePermission('invoicing', 'READ'), InvoiceController.getById);
invoiceRoutes.get('/:id/history', requirePermission('invoicing', 'READ'), InvoiceController.getHistory);
invoiceRoutes.post('/', requirePermission('invoicing', 'CREATE'), validateBody(createInvoiceBodySchema), InvoiceController.create);
invoiceRoutes.patch('/:id', requirePermission('invoicing', 'UPDATE'), validateBody(updateInvoiceBodySchema), InvoiceController.update);
invoiceRoutes.post('/:id/cancel', requirePermission('invoicing', 'UPDATE'), InvoiceController.cancel);

export { invoiceRoutes };
