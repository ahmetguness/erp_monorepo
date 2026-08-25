import { Hono } from 'hono';
import { requirePermission } from '../middleware/requirePermission';
import { HoldingCompanyController } from '../modules/platform/http/controllers/index.js';

const enterpriseRoutes = new Hono();

enterpriseRoutes.get('/holding', requirePermission('settings', 'READ'), HoldingCompanyController.get);

export { enterpriseRoutes };
