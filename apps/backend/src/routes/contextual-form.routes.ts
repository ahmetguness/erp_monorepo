import { Hono } from 'hono';
import { requirePermission } from '../middleware/requirePermission.js';
import { ContextualFormController } from '../modules/platform/http/controllers/index.js';

const contextualFormRoutes = new Hono();
contextualFormRoutes.get('/policy/invoice', requirePermission('invoicing', 'READ'), ContextualFormController.invoicePolicy);
contextualFormRoutes.get('/policy/contact', requirePermission('contacts', 'READ'), ContextualFormController.contactPolicy);
contextualFormRoutes.get('/policy/product', requirePermission('inventory', 'READ'), ContextualFormController.productPolicy);

export { contextualFormRoutes };
