import { Hono } from 'hono';
import { requirePermission } from '../middleware/requirePermission';
import { HoldingCompanyController } from '../controllers/holding-company.controller';

const enterpriseRoutes = new Hono();

enterpriseRoutes.get('/holding', requirePermission('settings', 'READ'), HoldingCompanyController.get);

export { enterpriseRoutes };
